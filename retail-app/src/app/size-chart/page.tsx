import type { Metadata } from 'next';
import { SIZES } from '@/lib/constants';

export const metadata: Metadata = { title: 'Size Guide' };

const charts = [
  {
    title: 'Tops & Dresses',
    headings: ['US/UK', 'Bust (in)', 'Bust (cm)'],
    row: (i: number) => [2 + i * 2, 32 + i * 2, 82 + i * 5],
  },
  {
    title: 'Bottoms',
    headings: ['Waist (in)', 'Waist (cm)', 'Hip (in)', 'Hip (cm)'],
    row: (i: number) => [24 + i * 2, 60 + i * 5, 34 + i * 2, 86 + i * 5],
  },
];

export default function SizeChart() {
  return (
    <main className="container section page" style={{ maxWidth: 800 }}>
      <h1 className="section-title">Size Guide</h1>
      {charts.map((chart) => (
        <div key={chart.title} className="size-table-block">
          <h3>{chart.title}</h3>
          <table className="size-table">
            <thead>
              <tr>
                <th>Size</th>
                {chart.headings.map((heading) => <th key={heading}>{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {SIZES.map((size, i) => (
                <tr key={size}>
                  <td>{size}</td>
                  {chart.row(i).map((value, j) => <td key={j}>{value}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </main>
  );
}
