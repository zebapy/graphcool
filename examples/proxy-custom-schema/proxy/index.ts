import * as express from 'express'
import * as cors from 'cors'
import * as bodyParser from 'body-parser'
import { graphqlExpress } from 'apollo-server-express'
import { transformSchema } from 'graphql-transform-schema'
import { makeRemoteExecutableSchema, makeExecutableSchema, mergeSchemas, introspectSchema } from 'graphql-tools'
import { HttpLink } from 'apollo-link-http'
import fetch from 'node-fetch'
import { express as playground } from 'graphql-playground/middleware'

async function run() {

  // Step 1: Create local version of the CRUD API
  const endpoint = 'https://api.graph.cool/simple/v1/cj8o8bmdo000y013326eme2q6'
  const link = new HttpLink({ uri: endpoint, fetch })
  const graphcoolSchema = makeRemoteExecutableSchema({
    schema: await introspectSchema(link),
    link,
  })

  // Step 2: Define schema for the new API
  // TODO https://github.com/apollographql/graphql-tools/issues/427
  const tmpSchema = makeExecutableSchema({
    typeDefs: `
      type Query {
        viewer: Viewer!
      }

      type Viewer {
        _tmp: String
      }
    `,
    resolvers: {
      Query: {
        viewer: () => ({}),
      }
    }
  })

  const extendTypeDefs = `
    extend type Viewer {
      me: User
      topPosts(limit: Int): [Post!]!
    }
  `

  // Step 3: Merge remote schema with new schema
  const mergedSchemas = mergeSchemas({
    schemas: [graphcoolSchema, tmpSchema, extendTypeDefs],
    resolvers: mergeInfo => ({
      Viewer: {
        me: {
          resolve(parent, args, context, info) {
            const alias = 'john' // should be determined from context
            return mergeInfo.delegate('query', 'User', { alias }, context, info)
          },
        },
        topPosts: {
          resolve(parent, { limit }, context, info) {
            return mergeInfo.delegate('query', 'allPosts', { first: limit }, context, info)
          },
        },
      },
    }),
  })

  // Step 4: Limit exposed operations from merged schemas 
  // Hide every root field except `viewer`
  const schema = transformSchema(mergedSchemas, {
    '*': false,
    viewer: true,
  })

  const app = express()

  app.use('/graphql', cors(), bodyParser.json(), graphqlExpress({ schema }))
  app.use('/playground', playground({ endpoint: '/graphql' }))

  app.listen(3000, () => console.log('Server running. Open http://localhost:3000/playground to run queries.'))
}

run().catch(console.error.bind(console))