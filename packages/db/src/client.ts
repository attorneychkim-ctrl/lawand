import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type Notification, type PoolClient } from "pg";

import * as schema from "./schema.js";

export type DatabasePoolOptions = {
  applicationName?: string;
  maxConnections?: number;
};

export function createDatabasePool(
  connectionString: string,
  options: DatabasePoolOptions = {},
) {
  return new Pool({
    connectionString,
    application_name: options.applicationName ?? "lawand-platform",
    max: options.maxConnections ?? 10,
  });
}

export function createDatabaseClient(
  connectionString: string,
  options: DatabasePoolOptions = {},
) {
  const pool = createDatabasePool(connectionString, options);

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>["db"];
export type DatabasePool = Pool;
export type DatabasePoolClient = PoolClient;
export type DatabaseNotification = Notification;
