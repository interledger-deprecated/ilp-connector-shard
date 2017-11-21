'use strict'
/* eslint-env mocha */

const nock = require('nock')
const fulfillCondition = require('../../src/handlers/public/fulfill-condition')

describe('Fulfill condition (public)', function () {
  beforeEach(function () {
    this.fulfillCondition = fulfillCondition()
  })

  it('posts the fulfillment', async function () {
    nock('http://connie-east:8081')
      .post('/internal/transfer/5857d460-2a46-4545-8311-1539d99e78e8/fulfillment', {
        fulfillment: 'HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok',
        fulfillmentData: 'ABAB'
      })
      .reply(204)
    await this.fulfillCondition({
      id: 'd18892e4-a8f8-4417-8d24-fd87867d88e0',
      noteToSelf: {
        source: {
          uri: 'http://connie-east:8081',
          id: '5857d460-2a46-4545-8311-1539d99e78e8'
        }
      }
    }, 'HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'ABAB')
  })
})
