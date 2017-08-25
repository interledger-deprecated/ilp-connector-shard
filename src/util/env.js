'use strict'

const parseJson = require('parse-json')

const env = process.env

const assertEnv = name => {
  if (typeof process.env[name] === 'undefined') {
    throw new Error(`Environment variable ${name} is required`)
  }
}

const envJson = name => env[name] && parseJson(env[name], name)

module.exports = {
  assertEnv,
  envJson
}
