import { useEffect, useState } from "react";
import Table from "./components/Table";

interface DisplayItem {
  item_name: string;
  datetime: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  volume: number;
}

interface ApiResponse {
  last_updated: string;
  top_performer: DisplayItem[];
  top_seller: DisplayItem[];
  top_traded: DisplayItem[];
}

const hoursOptions = [24, 48, 168, 336, 720, 2160];

const App: React.FC = () => {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<ApiResponse | null>(null);

  const fetchData = async (h: number) => {
    const res = await fetch(`https://voidwatch.dasnerdwork.net/api/top?hours=${h}&limit=10`);
    const json = await res.json();
    setData(json);
  };

  useEffect(() => {
    fetchData(hours);
  }, [hours]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("de-DE");
  };

  return (
    <div className="bg-gray-900 text-gray-100 font-sans min-h-screen flex flex-col items-center justify-center p-8 space-y-12">
      <h1 className="text-5xl font-bold">Tagespreise</h1>
      <div className="test"></div>
      <span className="!mt-4">Letzte Aktualisierung: {data ? formatDate(data.last_updated) : "–"}</span>

      <div className="flex flex-wrap justify-center gap-3">
        {hoursOptions.map((h) => (
          <button
            key={h}
            onClick={() => setHours(h)}
            className={`px-4 py-2 rounded-full font-medium transition ${
              hours === h ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
          >
            {h === 24
              ? "Letzte 24h"
              : h === 48
              ? "Letzte 48h"
              : h === 168
              ? "Letzte 7 Tage"
              : h === 336
              ? "Letzte 14 Tage"
              : h === 720
              ? "Letzte 30 Tage"
              : "Letzte 90 Tage"}
          </button>
        ))}
      </div>

      {data && (
        <>
          <Table title="Top Performer" rows={data.top_performer} hours={hours} />
          <Table title="Top Seller" rows={data.top_seller} hours={hours} />
          <Table title="Meistgehandelt" rows={data.top_traded} hours={hours} />
        </>
      )}
    </div>
  );
};

export default App;
