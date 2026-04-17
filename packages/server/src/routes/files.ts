import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth';
import { insertFile, getFile, deleteFileRecord } from '../db';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB ?? '20', 10) * 1024 * 1024;

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = UPLOAD_DIR;
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    cb(null, uuidv4());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// POST /api/files/upload
router.post('/upload', requireAuth, upload.array('files', 10), (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const { table_name, record_id, field_name } = req.query as Record<string, string>;

  const records = files.map(f => {
    const id = path.basename(f.filename);
    return insertFile({
      id,
      filename: f.originalname,
      mime_type: f.mimetype,
      size: f.size,
      path: f.filename,
      table_name: table_name ?? null,
      record_id: record_id ?? null,
      field_name: field_name ?? null,
      uploaded_by: req.user!.id,
    });
  });

  res.json(records.map(r => ({
    id: r.id,
    filename: r.filename,
    mime_type: r.mime_type,
    size: r.size,
    url: `/api/files/${r.id}`,
  })));
});

// GET /api/files/:id
router.get('/:id', requireAuth, (req, res) => {
  const record = getFile(String(req.params.id));
  if (!record) { res.status(404).json({ error: 'File not found' }); return; }

  const filePath = path.join(UPLOAD_DIR, record.path);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found on disk' }); return; }

  const isImage = record.mime_type.startsWith('image/');
  const isPdf = record.mime_type === 'application/pdf';
  res.setHeader('Content-Type', record.mime_type);
  res.setHeader('Content-Disposition',
    (isImage || isPdf)
      ? `inline; filename="${encodeURIComponent(record.filename)}"`
      : `attachment; filename="${encodeURIComponent(record.filename)}"`
  );
  res.sendFile(path.resolve(filePath));
});

// DELETE /api/files/:id
router.delete('/:id', requireAuth, (req, res) => {
  const record = getFile(String(req.params.id));
  if (!record) { res.status(404).json({ error: 'File not found' }); return; }

  if (record.uploaded_by !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const filePath = path.join(UPLOAD_DIR, record.path);
  try { fs.unlinkSync(filePath); } catch { /* file already gone */ }
  deleteFileRecord(record.id);

  res.json({ success: true });
});

export default router;
