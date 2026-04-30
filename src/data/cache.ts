import NodeCache from "node-cache";
import { config } from "../config";

export const appCache = new NodeCache({
  stdTTL: config.CACHE_TTL_SECONDS,
  useClones: false
});
