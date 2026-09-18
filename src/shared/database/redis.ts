import Redis from "ioredis";
import { env } from "../config/env";

export const redis = new Redis(env.REDIS_URL);

redis.on("connect", () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log("Redis connected successfully.");
  }
});

redis.on("error", (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error("Redis connection error:", err);
  }
});
