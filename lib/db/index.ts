import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const databaseGlobal = globalThis as typeof globalThis & {
  conversationDatabase?: ReturnType<typeof createDatabase>
}

function createDatabase() {
  const url = process.env.DATABASE_URL
  if (!url)
    throw new Error('DATABASE_URL is required to connect to PostgreSQL.')

  const client = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false
  })

  return { client, db: drizzle(client, { schema }) }
}

function getConnection() {
  databaseGlobal.conversationDatabase ??= createDatabase()
  return databaseGlobal.conversationDatabase
}

export function getDb() {
  return getConnection().db
}

export function getSqlClient() {
  return getConnection().client
}

export async function closeDatabase() {
  const connection = databaseGlobal.conversationDatabase
  if (!connection) return
  delete databaseGlobal.conversationDatabase
  await connection.client.end({ timeout: 5 })
}

export type Database = ReturnType<typeof getDb>
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
