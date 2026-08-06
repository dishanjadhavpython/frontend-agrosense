import { fetchWeather } from "@/data/weather";
import { WeatherPanel } from "./WeatherPanel";

/**
 * The only server component on the public page, and it is one for a reason.
 *
 * The fetch has to stay on this side: it is cached once for everybody rather
 * than run per visitor, it never appears in the client bundle, and it keeps a
 * third-party round trip off a phone that may be on 2G in a field. What it
 * cannot do is render — every section on this site speaks two languages through
 * `useLang()`, which is a client context. So this component fetches and hands a
 * plain object to `<WeatherPanel>`, which draws.
 *
 * `fetchWeather` returns null rather than throwing, and the panel knows how to
 * render nothing gracefully. That is load-bearing: this runs during
 * `next build`, and a weather API having a bad afternoon must not be able to
 * fail a deploy.
 */
export async function Weather() {
  const weather = await fetchWeather();
  return <WeatherPanel weather={weather} />;
}
