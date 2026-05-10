type Grid = {
  columns: string[];
  rows: Record<string, string | number>[];
};

export function DataGrid({ grid }: { grid?: Grid }) {
  if (!grid?.rows?.length) return null;

  return (
    <div className="grid-wrap">
      <table>
        <thead>
          <tr>
            {grid.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, index) => (
            <tr key={index}>
              {grid.columns.map((column) => (
                <td key={column}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
