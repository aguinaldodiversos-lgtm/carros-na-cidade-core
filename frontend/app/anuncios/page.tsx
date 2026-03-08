import { Suspense } from "react";
import { VehicleSearchResultsPage } from "../../components/search/VehicleSearchResultsPage";

export default function AnunciosPage() {
  return (
    <Suspense>
      <VehicleSearchResultsPage />
    </Suspense>
  );
}
