import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type Notification, type PoolClient } from "pg";

import * as schema from "./schema.js";

export function createDatabaseClient(connectionString: string) {
  const pool = new Pool({
    connectionString,
    application_name: "lawand-platform",
    max: 10,
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>["db"];
export type DatabasePool = Pool;
export type DatabasePoolClient = PoolClient;
export type DatabaseNotification = Notification;
