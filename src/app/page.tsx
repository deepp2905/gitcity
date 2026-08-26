import { Suspense } from "react";
import { CityApp } from "@/components/city-app";

export default function Home() {
  return (
    // useSearchParams() in CityApp requires a Suspense boundary so the
    // shell can prerender statically.
    <Suspense fallback={null}>
      <CityApp />
    </Suspense>
  );
}
