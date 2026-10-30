import { estimateTravel } from '../../client/src/lib/geo.js';
import * as onemap from './onemap.js';
import { getCached, setCached, routeKey } from './cache.js';

// Request-scoped exact departure cache; persisted acceptedRoutes belong to the
// itinerary and are handled by the domain engine on subsequent requests.
export function createPlanningTravel() {
  const live = new Map();
  const key = (a,b,t) => `${a.lat},${a.lng}|${b.lat},${b.lng}|${t}`;
  return {
    travelFn(departMs) {
      return (a,b,t=departMs) => live.get(key(a,b,t)) || estimateTravel(a,b);
    },
    async prefetchLegs(points, departMs) {
      if (!onemap.isConfigured()) return { live:false };
      let fetched = 0;
      await Promise.all(points.slice(1).map(async (to,i) => {
        const from=points[i], t=Array.isArray(departMs)?departMs[i]:departMs;
        const k=key(from,to,t), mode=estimateTravel(from,to).mode;
        const request={from,to,mode,depart:new Date(t)};
        try {
          const cacheKey=routeKey(request);
          let route=getCached(cacheKey);
          if (!route) { route=await onemap.route(request); setCached(cacheKey,route); }
          if (route.durationMins>0) { live.set(k,{mins:route.durationMins,mode,estimate:false}); fetched++; }
        } catch { /* truthful labelled estimate remains available */ }
      }));
      // Live only when at least one leg actually came from OneMap.
      return { live:fetched>0, fetched };
    },
  };
}
