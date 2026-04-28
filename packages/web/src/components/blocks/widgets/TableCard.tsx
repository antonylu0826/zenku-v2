import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';

export function MiniTableWidget({
  title,
  data,
  labelMap,
}: {
  title: string;
  data: Record<string, unknown>[];
  labelMap: Record<string, string>;
}) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{t('common.no_data')}</p>
        </CardContent>
      </Card>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-1">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map(col => (
                <TableHead
                  key={col}
                  className="h-8 px-4 text-xs font-medium text-muted-foreground"
                >
                  {labelMap[col] ?? col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 10).map((row, i) => (
              <TableRow key={i}>
                {columns.map(col => (
                  <TableCell key={col} className="px-4 py-2 text-xs tabular-nums">
                    {String(row[col] ?? '-')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
