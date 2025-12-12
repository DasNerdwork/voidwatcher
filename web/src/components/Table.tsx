import React from "react";

interface DisplayItem {
  item_name: string;
  datetime: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  volume: number;
}

interface Props {
  title: string;
  rows: DisplayItem[];
  hours: number;
}

const Table: React.FC<Props> = ({ title, rows, hours }) => {
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE");

  return (
    <div className="w-full px-4 max-w-6xl">
      <h2 className="text-3xl font-semibold mb-4">
        {title} ({hours} Stunden)
      </h2>
      <div className="overflow-x-auto bg-gray-800 rounded-xl shadow-md">
        <table className="table-auto w-full text-sm text-left border-collapse">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="px-6 py-3">Item</th>
              <th className="px-6 py-3">Datum</th>
              <th className="px-6 py-3">Ø Preis</th>
              <th className="px-6 py-3">Min Preis</th>
              <th className="px-6 py-3">Max Preis</th>
              <th className="px-6 py-3">Verkauft</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center px-6 py-4 border-t border-gray-700">
                  Keine Daten gefunden
                </td>
              </tr>
            ) : (
              rows.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-700 transition text-center">
                  <td className="px-6 py-3 border-t border-gray-700">{item.item_name}</td>
                  <td className="px-6 py-3 border-t border-gray-700">{formatDate(item.datetime)}</td>
                  <td className="px-6 py-3 border-t border-gray-700">{item.avg_price.toFixed(2)}</td>
                  <td className="px-6 py-3 border-t border-gray-700">{item.min_price.toFixed(0)}</td>
                  <td className="px-6 py-3 border-t border-gray-700">{item.max_price.toFixed(0)}</td>
                  <td className="px-6 py-3 border-t border-gray-700">{item.volume}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Table;
