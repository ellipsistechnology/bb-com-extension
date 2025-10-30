import { jsonTypes, reservedClasses, schemaToClassMap, toCammelCase } from './utils.js'

export interface TemplateMap {
  serviceName:string,
  bbName:string,
  methods:{
    operationId:string,
    path: string,
    method: string
  }[]
}

function methodType(oasDoc: any, path: string, method: string, schemaToClass: { [key:string]: string }): string {
  // If there is no response content then default to 'any':
  if(!oasDoc.paths[path][method].responses?.['200']?.content) {
    return 'void'
  }

  // Get the schema for the 200 response:
  const schema = oasDoc.paths[path][method].responses['200'].content['application/json'].schema;

  let allOf
  if(Array.isArray(schema.allOf))
    allOf = schema.allOf
  else if(schema.type === 'array' && schema.items && schema.items.allOf)
    allOf = schema.items.allOf

  let type = ''
  if(allOf) {
    type = allOf
      .map((childSchema:any) => schemaToClass[childSchema['$ref']])
      .join('&')
  }
  else if(schema.type === 'array' && schema.items && schema.items['$ref']) {
    type = schemaToClass[schema.items['$ref']]
  }
  else if(schema['$ref']) {
    type = schemaToClass[schema['$ref']]
  } else if(typeof schema.type === 'string') {
    type = schema.type
  }

  if(type && schema.type === 'array') {
    return type + '[]'
  } else if(type) {
    return type
  } else {
console.log(`No type found for ${method} ${path}, defaulting to 'void'.`);
    return 'void'
  }
}

export default function (openapiDoc: any, {bbName, serviceName, methods}:TemplateMap):string {

  const className = toCammelCase(serviceName)
  const classVarName = toCammelCase(serviceName, false)
  const schemaToClass = schemaToClassMap(openapiDoc)

  let imports = ''
  new Set(methods // use a set to remove duplicates
    .map(method => methodType(openapiDoc, method.path, method.method, schemaToClass)) // extract types from methods
    .filter(type => type) // remove empty - shouldn't happen???
    .filter(type => !jsonTypes.includes(type)) // remove primitives
    .map((type:string) => type.endsWith('[]') ? type.substring(0, type.length-2) : type)
    .reduce((classes, type) => classes.concat(type.split('&')), <string[]>[]) // split Type1&Type2
    .reduce((classes, type) => classes.concat(type.split('|')), <string[]>[]) // split Type1|Type2
  ).forEach(type => imports += `import ${type} from '${reservedClasses.includes(type) ? '../gensrc/' : './'}${type}.js'\n`)

  return `import {serviceClass, autowired} from 'ellipsis-ioc'
${imports}
import { ComManager } from '../gensrc/ComPort.js'

@serviceClass('${classVarName}')
export class ${className}Service {

  @autowired('openapi-doc')
  openapiDoc:any

  @autowired('com-manager')
  comManager!: ComManager

  constructor() {
  }
  ${methods.map( method => {
    const pathParams = (method.path.match(/{(.*?)}/g) || []).map( (p) => p.substring(1, p.length-1) )
    if(['post', 'put', 'patch'].includes(method.method)) {
      pathParams.push('data')
    }
    const pathParamsList = pathParams.length > 0 ? '{'+pathParams.join(', ')+'}' : ''
    const serviceType = openapiDoc.paths[method.path][method.method].requestBody?.content?.['application/json']?.schema?.$ref ?
      schemaToClass[openapiDoc.paths[method.path][method.method].requestBody.content['application/json'].schema.$ref] :
      schemaToClass[openapiDoc.paths[method.path][method.method].requestBody?.content?.['application/json']?.schema?.type] ?
      schemaToClass[openapiDoc.paths[method.path][method.method].requestBody.content['application/json'].schema.type] :
      'any'

    const pathParamTypes = pathParams.length > 0 ? '{'+pathParams.map( p => `${p}: ${p === 'data' ? serviceType : p.endsWith('index') ? 'number' : 'string'}`).join(', ')+'}' : ''
    const returnType = methodType(openapiDoc, method.path, method.method, schemaToClass)
    return `
  async ${method.operationId}(${pathParamsList}${pathParams.length > 0 ? ': ' : ''}${pathParamTypes}): Promise<${returnType}> {
    const port = await this.comManager.getComPort('${bbName}', 0)
    const responses = await port.send('${method.method}')

    // TODO: Process responses to extract data.

    throw new Error(\`${method.operationId} not yet implemented.\`)
  }`}).join('\n')}
}
`
}
