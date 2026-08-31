import { useTileData } from './useTileData.js';

const CODES = {
  0: ['Clear', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'], 51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌦️'], 61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 80: ['Showers', '🌦️'],
  81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'],
};

export function WeatherTile({ tile }) {
  const c = tile.config || {};
  const { data, error, loading } = useTileData(
    `/api/tile/weather?lat=${c.latitude}&lon=${c.longitude}&units=${c.units || 'metric'}`,
    900,
    [c.latitude, c.longitude, c.units]
  );

  if (loading && !data) return <div class="tile-panel tile-weather tile-panel-muted">Loading weather…</div>;
  if (error) return <div class="tile-panel tile-weather tile-panel-muted">Weather error: {error}</div>;

  const cur = data?.current || {};
  const [label, icon] = CODES[cur.weather_code] || ['—', '🌡️'];
  const tempUnit = (c.units || 'metric') === 'imperial' ? '°F' : '°C';
  const windUnit = (c.units || 'metric') === 'imperial' ? 'mph' : 'km/h';

  return (
    <div class="tile-panel tile-weather">
      <div class="tile-weather-main">
        <span class="tile-weather-icon">{icon}</span>
        <span class="tile-weather-temp">
          {Math.round(cur.temperature_2m)}
          {tempUnit}
        </span>
      </div>
      <div class="tile-weather-meta">
        <span>{c.label || label}</span>
        <span>
          feels {Math.round(cur.apparent_temperature)}
          {tempUnit} · {Math.round(cur.wind_speed_10m)} {windUnit} · {cur.relative_humidity_2m}%
        </span>
      </div>
    </div>
  );
}
