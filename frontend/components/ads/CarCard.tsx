
import Image from "next/image";
import Link from "next/link";

type CarData = {
  slug?: string;
  title: string;
  image: string;
  city?: string;
  state?: string;
  sponsored?: boolean;
  discount?: number | string;
  price: string;
};

type CarCardProps =
  | {
      car: CarData;
    }
  | {
      title: string;
      price: string;
    };

export default function CarCard(props: CarCardProps) {
  const car: CarData =
    "car" in props
      ? props.car
      : {
          title: props.title,
          price: props.price,
          image: "/images/corolla.jpeg",
        };

  return (
    <Link
      href={`/anuncios/${car.slug ?? ""}`}
      className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition overflow-hidden"
    >
      <div className="relative h-56">

        {car.sponsored && (
          <span className="absolute top-4 left-4 bg-blue-600 text-white text-xs px-3 py-1 rounded-md z-10">
            Patrocinado
          </span>
        )}

        <button className="absolute top-4 right-4 bg-white w-9 h-9 rounded-full shadow flex items-center justify-center z-10">
          ♡
        </button>

        <Image
          src={car.image}
          alt={car.title}
          fill
          className="object-cover group-hover:scale-105 transition duration-300"
        />
      </div>

      <div className="px-5 py-4">
        <h3 className="font-semibold text-[16px] text-gray-900">
          {car.title}
        </h3>

        <p className="text-sm text-gray-500 mt-1">
          {car.city} - {car.state}
        </p>

        <div className="flex justify-between items-center mt-4">
          <span className="text-blue-600 font-bold text-xl">
            {car.price}
          </span>

          {car.discount && (
            <span className="bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded-md">
              {car.discount}% abaixo FIPE
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
