# Phase 7：權限與多租戶

> **目標：** 使用者認證、角色權限、資料隔離。
> **建議模型：Sonnet**（成熟模式，大量 CRUD 和 middleware）

---

## 7.1 系統表

```sql
CREATE TABLE _zenku_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',   -- 'admin' | 'builder' | 'user'
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- Session（JWT 或 DB session 皆可）
CREATE TABLE _zenku_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES _zenku_users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 7.2 認證 API

```typescript
// server/src/middleware/auth.ts

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  const hash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();
  // 第一個使用者自動為 admin
  const role = isFirstUser() ? 'admin' : 'user';
  db.prepare('INSERT INTO _zenku_users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, name, hash, role);
  const token = generateToken(id);
  res.json({ token, user: { id, email, name, role } });
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM _zenku_users WHERE email = ?').get(email);
  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }
  db.prepare('UPDATE _zenku_users SET last_login_at = datetime("now") WHERE id = ?').run(user.id);
  const token = generateToken(user.id);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// Token 驗證 middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登入' });
  const session = db.prepare('SELECT * FROM _zenku_sessions WHERE token = ? AND expires_at > datetime("now")').get(token);
  if (!session) return res.status(401).json({ error: 'Token 過期' });
  req.user = db.prepare('SELECT id, email, name, role FROM _zenku_users WHERE id = ?').get(session.user_id);
  next();
}
```

### 新增依賴

```bash
npm install bcryptjs jsonwebtoken
npm install -D @types/bcryptjs @types/jsonwebtoken
```

---

## 7.3 角色權限

### 三種角色

| 權限 | admin | builder | user |
|------|-------|---------|------|
| 修改資料結構 | ✓ | ✓ | ✗ |
| 修改介面 | ✓ | ✓ | ✗ |
| 建立業務規則 | ✓ | ✓ | ✗ |
| 查詢資料 | ✓ | ✓ | ✓ |
| CRUD 資料 | ✓ | ✓ | ✓ |
| 上傳檔案 | ✓ | ✓ | ✓ |
| 管理使用者 | ✓ | ✗ | ✗ |
| 查看對話歷程 | ✓ | ✗ | ✗ |
| 查看 Usage 統計 | ✓ | ✗ | ✗ |

### Orchestrator 動態 Tool 調整

```typescript
// orchestrator.ts
function getToolsForRole(role: UserRole): Tool[] {
  const allTools = [...TOOLS];

  if (role === 'user') {
    // user 只能查詢和操作檔案
    return allTools.filter(t => ['query_data', 'manage_files'].includes(t.name));
  }
  if (role === 'builder') {
    // builder 不能 undo（只有 admin 可以）
    return allTools.filter(t => t.name !== 'undo_action');
  }
  return allTools; // admin 全部
}
```

---

## 7.4 資料層級權限（Row-Level Security）

### 實作方式

使用者表如果有 `created_by` 欄位，`user` 角色只能看自己建立的資料：

```typescript
// Schema Agent 建表時自動加入 created_by 欄位
// CREATE TABLE orders (..., created_by TEXT REFERENCES _zenku_users(id))

// CRUD API 中自動注入
app.get('/api/data/:table', requireAuth, (req, res) => {
  // ...
  if (req.user.role === 'user' && hasColumn(table, 'created_by')) {
    where += ` AND "created_by" = ?`;
    whereValues.push(req.user.id);
  }
});

app.post('/api/data/:table', requireAuth, (req, res) => {
  // 自動寫入 created_by
  if (hasColumn(table, 'created_by')) {
    req.body.created_by = req.user.id;
  }
  // ...
});
```

### 對話觸發 RLS

```
使用者：「業務只能看自己的訂單」

Orchestrator → manage_schema({
  action: 'alter_table',
  table_name: 'orders',
  changes: [{ operation: 'add_column', column: { name: 'created_by', type: 'TEXT' } }]
})
→ 回覆：「已啟用資料隔離，user 角色只能看到自己建立的訂單」
```

---

## 7.5 前端

### 登入頁面

```
components/auth/LoginPage.tsx
```

```tsx
function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  // Email + Password form
  // POST /api/auth/login or /register
  // 成功後存 token 到 localStorage
  // redirect 到主頁
}
```

### AuthProvider

```tsx
// 包在 App 最外層
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('zenku-token');
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(setUser)
        .catch(() => localStorage.removeItem('zenku-token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return <Spinner />;
  if (!user) return <LoginPage onLogin={setUser} />;
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}
```

### UserMenu（Sidebar 底部）

```tsx
function UserMenu({ user }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Avatar>{user.name[0]}</Avatar>
        <span>{user.name}</span>
        <Badge variant="outline">{user.role}</Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {user.role === 'admin' && <DropdownMenuItem>使用者管理</DropdownMenuItem>}
        {user.role === 'admin' && <DropdownMenuItem>對話歷程</DropdownMenuItem>}
        {user.role === 'admin' && <DropdownMenuItem>用量統計</DropdownMenuItem>}
        <DropdownMenuItem onClick={logout}>登出</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## 7.6 管理者介面（Admin 專用）

### 使用者管理頁面

```
/admin/users
- 使用者列表（姓名、Email、角色、最後登入）
- 修改角色（user ↔ builder ↔ admin）
- 停用帳號
```

### API

```typescript
// admin only
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, created_at, last_login_at FROM _zenku_users').all();
  res.json(users);
});

app.put('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  db.prepare('UPDATE _zenku_users SET role = ? WHERE id = ?').run(req.body.role, req.params.id);
  res.json({ success: true });
});
```

---

## 7.7 多租戶（未來選項）

### 方案 A：每租戶一個 SQLite 檔

```
data/
├── tenant-abc.db
├── tenant-xyz.db
└── system.db        # 儲存租戶列表、全域設定
```

middleware 根據 subdomain 或 header 選擇 DB 檔案。

### 方案 B：遷移到 PostgreSQL

```
每個租戶一個 schema：
- tenant_abc.customers
- tenant_abc.orders
- tenant_xyz.customers

SET search_path TO tenant_abc;
```

> 建議先用方案 A（SQLite 隔離），到需要 SaaS 時再考慮 B。

---

## 新增檔案

```
server/src/middleware/auth.ts
server/src/middleware/permission.ts

web/src/components/auth/LoginPage.tsx
web/src/components/auth/AuthProvider.tsx
web/src/components/auth/UserMenu.tsx
web/src/components/admin/UserManagement.tsx
```

---

## 驗收標準

- [x] 第一個使用者自動成為 admin
- [x] 登入 / 註冊流程正常
- [x] user 角色無法修改結構（AI 工具被過濾，只剩 query_data）
- [ ] user 角色只能看到自己建立的資料（RLS，尚未實作）
- [x] admin 可以管理使用者角色
- [x] 登出後需要重新登入

---

## 實作紀錄（2026-04-14）

### 已完成

**Server：**
- `db.ts`：新增 `_zenku_users`、`_zenku_sessions` 系統表；`getUserCount()` helper
- `middleware/auth.ts`：DB session token（UUID，30 天到期）；`requireAuth` / `requireAdmin`；register（第一位自動 admin）/ login / me / logout / status handlers
- `index.ts`：掛載 `/api/auth/*` 和 `/api/admin/*`；所有 CRUD 端點加 `requireAuth`；user role 傳入 `chat()`
- `orchestrator.ts`：`getToolsForRole()` 依角色過濾工具（admin 全部 / builder 不含 undo / user 只有 query_data）

**Web：**
- `contexts/AuthContext.tsx`：AuthProvider + useAuth hook
- `components/auth/LoginPage.tsx`：登入 + 註冊表單，初次使用顯示「建立管理員帳號」
- `components/auth/UserMenu.tsx`：側欄底部頭像 + 下拉（登出、使用者管理）
- `components/admin/UserManagement.tsx`：管理員模態視窗，列出所有用戶可改角色
- `api.ts`：所有請求自動帶 `Authorization: Bearer <token>` header
- `App.tsx`：AuthProvider 包裹，fallback 顯示 LoginPage

### 待完成

- [ ] Row-Level Security（RLS）：user 只能看自己建立的資料（需在資料表加 `created_by`）
- [ ] 多租戶（未來選項）
