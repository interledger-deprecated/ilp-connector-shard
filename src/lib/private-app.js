'use strict'

const http = require('http')
const Koa = require('koa')
const Router = require('koa-router')
const Logger = require('koa-logger')
const Parser = require('koa-bodyparser')
const Boom = require('boom')

class PrivateApp {
  constructor ({ handlers }) {
    const app = new Koa()
    const router = new Router()
    const parser = new Parser()
    const logger = new Logger()

    app.use(logger)
    app.use(parser)
    app.use(router.routes())
    app.use(router.allowedMethods({
      throw: true,
      notImplemented: () => Boom.notImplemented(),
      methodNotAllowed: () => Boom.methodNotAllowed()
    }))

    router.post('/internal/transfer', async (ctx) => {
      ctx.body = await handlers.sendTransfer({ transfer: ctx.request.body.transfer })
      ctx.status = 200
    })

    router.post('/internal/transfer/:id/fulfillment', async (ctx) => {
      await handlers.fulfillCondition({ id: ctx.params.id, fulfillment: ctx.request.body.fulfillment })
      ctx.status = 200
    })

    router.post('/internal/transfer/:id/rejection', async (ctx) => {
      await handlers.rejectIncomingTransfer({ id: ctx.params.id, rejectionMessage: ctx.request.body })
      ctx.status = 200
    })

    router.post('/internal/request', async (ctx) => {
      ctx.body = await handlers.sendRequest({
        ilp: ctx.request.body.ilp,
        // "custom" is used in the route-manager for route broadcasts.
        custom: ctx.request.body.custom
      })
      ctx.status = 200
    })

    router.post('/internal/routes', async (ctx) => {
      await handlers.updateRoutes({ all: ctx.request.body.all })
      ctx.status = 200
    })

    this.app = app
    this.router = router
  }

  listen (port) {
    this.server = http.createServer(this.app.callback()).listen(port)
  }

  close () {
    this.server.close()
  }
}

module.exports = PrivateApp
