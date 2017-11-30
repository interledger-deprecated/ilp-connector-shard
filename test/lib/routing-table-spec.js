'use strict'
/* eslint-env mocha */

const assert = require('assert')
const RoutingTable = require('../../src/lib/routing-table')

describe('RoutingTable', function () {
  describe('getNextHop', function () {
    it('returns the first match', function () {
      const table = new RoutingTable({
        initialTable: [
          { prefix: 'g.usd.connie.west.', curveLocal: [], curveRemote: [] },
          { prefix: 'g.usd.connie.east.', curveLocal: [], curveRemote: [] },
          { prefix: 'g.usd.connie.', curveLocal: [], curveRemote: [] },
          { prefix: 'g.usd.conrad.', curveLocal: [], curveRemote: [] }
        ]
      })
      assert.equal(table.getNextHop('g.usd.connie.west.bob').prefix, 'g.usd.connie.west.')
      assert.equal(table.getNextHop('g.usd.connie.east.bob').prefix, 'g.usd.connie.east.')
      assert.equal(table.getNextHop('g.usd.connie.south.bob').prefix, 'g.usd.connie.')
      assert.equal(table.getNextHop('g.usd.conrad.west.bob').prefix, 'g.usd.conrad.')
      assert.equal(table.getNextHop('g.usd.charles.west.bob'), null)
    })
  })
})
