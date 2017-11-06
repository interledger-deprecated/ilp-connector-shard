'use strict'
/* eslint-env mocha */

const assert = require('assert')
const RoutingTable = require('../../src/lib/routing-table')
const updateRoutes = require('../../src/handlers/private/update-routes')

describe('Update routes', function () {
  beforeEach(function () {
    this.routingTable = new RoutingTable({
      initialTable: [{
        prefix: 'g.eur.connie.east.',
        shard: 'http://connie-east:8081',
        curveLocal: [[0, 0], [500, 1000]],
        local: true
      }]
    })
    this.updateRoutes = updateRoutes({ routingTable: this.routingTable })
  })

  it('replaces the table\'s routes', function () {
    this.updateRoutes({
      all: [{
        prefix: 'g.eur.connie.east.',
        shard: 'http://connie-south:8081',
        curveLocal: [[0, 0], [123, 456]],
        local: true
      }]
    })
    assert.equal(this.routingTable.getNextHop('g.eur.connie.east.bob').shard, 'http://connie-south:8081')
  })
})
