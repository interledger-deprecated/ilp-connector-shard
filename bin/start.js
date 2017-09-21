#!/usr/bin/env node
'use strict'

const startShard = require('../')
const { assertEnv, envJson } = require('../src/util/env')
const Store = require('../src/lib/store')

assertEnv('ICS_INTERNAL_URI')
assertEnv('ICS_PLUGIN')
assertEnv('ICS_PLUGIN_OPTS')

const Plugin = require(process.env.ICS_PLUGIN)
const pluginOpts = envJson('ICS_PLUGIN_OPTS')
if (pluginOpts.store) {
  const store = new Store()
  pluginOpts._store = store
}
const plugin = new Plugin(pluginOpts)

const uuidSecret = (process.env.ICS_UUID_SECRET && Buffer.from(process.env.ICS_UUID_SECRET, 'base64'))

startShard({
  plugin,
  initialTable: envJson('ICS_INITIAL_ROUTING_TABLE'),
  internalUri: process.env.ICS_INTERNAL_URI,
  uuidSecret,
  publicPort: process.env.ICS_PUBLIC_PORT,
  privatePort: process.env.ICS_PRIVATE_PORT
}).catch(err => console.error(err && err.stack))
