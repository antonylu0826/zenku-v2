import type { ViewDefinition } from '../types';
import { TableView } from './blocks/TableView';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface Props {
  view: ViewDefinition | null;
}

export function AppArea({ view }: Props) {
  if (!view) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>尚未建立資料視圖</CardTitle>
            <CardDescription>先在右側聊天面板輸入需求，系統會自動產生資料表與介面。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">例如：我要管理客戶資料，有姓名、電話、email。</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-background">
      <TableView view={view} />
    </div>
  );
}
