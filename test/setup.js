'use strict'
/* eslint-env mocha */

const assert = require('assert')
const nock = require('nock')
const lolex = require('lolex')
const START_DATE = 1500000000000

beforeEach(function () {
  this.START_DATE = START_DATE
  this.clock = lolex.install({now: START_DATE})
})

afterEach(function () {
  this.clock.uninstall()

  const isDone = nock.isDone()
  nock.cleanAll()
  assert(isDone, 'not all nocks were called')
})
