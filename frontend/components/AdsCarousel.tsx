// frontend/components/AdsCarousel.tsx

interface Ad {
  id: number;
  title: string;
  price: number;
}

interface Props {
  title: string;
  ads: Ad[];
}

export default function AdsCarousel({ title, ads }: Props) {
  return (
    <section className="max-w-7xl mx-auto mt-16 px-6">
      <h2 className="text-3xl font-bold mb-8">{title}</h2>

      <div className="grid md:grid-cols-4 gap-6">
        {ads.map((ad) => (
          <div
            key={ad.id}
            className="bg-white rounded-2xl shadow hover:shadow-xl transition p-4"
          >
            <div className="h-40 bg-gray-200 rounded-lg mb-4"></div>

            <h3 className="font-semibold mb-2">{ad.title}</h3>

            <p className="text-yellow-500 font-bold text-xl">
              R$ {ad.price}
            </p>

            <button className="mt-4 w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition">
              Ver anúncio
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
