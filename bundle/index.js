import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "node:module";
const __WEBPACK_EXTERNAL_createRequire_require = __WEBPACK_EXTERNAL_createRequire(import.meta.url);
/******/ var __webpack_modules__ = ({

/***/ "./dist/src/ComPortTemplate.js":
/*!*************************************!*\
  !*** ./dist/src/ComPortTemplate.js ***!
  \*************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ comPortTemplate)
/* harmony export */ });
function comPortTemplate() {
    return `import { SerialPort } from 'serialport';
import {autowired, named} from 'ellipsis-ioc'

class ComType {
  constructor(
    public name: string,
    public baud: number,
    public methods: {
      init: ComMacro[],
      [method: string]: ComMacro[]
    }
  ) {}

  toString() {
    return \`ComType(name='\${this.name}', baud=\${this.baud})\`
    + \`[\${Object.entries(this.methods).map(([m, macros]) => (
      \`\n\t\${m}: [\${macros.map(cm => cm.toString()).join(', ')}]\`
    )).join('')}\n]\`
  }
}

class ComMacro {
  constructor(
    public command: string,
    public response: RegExp
  ) {}

  toString() {
    return \`ComMacro(command='\${this.command}', response=\${this.response.toString()})\`
  }
}

class ComPort {
  private port: SerialPort | null = null
  private readMatch?: RegExp
  private readComplete = false
  private buffer: string = '' // TODO replace with Buffer

  state: 'busy' | 'closed' | 'background' | 'connecting' = 'closed'
  type: ComType | null = null
  lastError: string | null = null
  timeout: number = 5000 // TODO: Allow setting this at the service level and at the method level.
  lineEnding: string = '\n' // TODO: Allow setting this at the service level and at the method level.

  // General port info:
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  locationId?: string
  productId?: string
  vendorId?: string

  constructor(public path: string) {}

  toString() {
    return \`ComPort(path=\${this.path}, state=\${this.state}\${this.type?', type=':''}\${this.type ? this.type?.name:''}\${this.lastError?', lastError=':''}\${this.lastError ? this.lastError:''})\`
  }

  async setType(type: ComType): Promise<boolean> {
    try {
      await this.connect(type.baud) // throws an error if connection fails
      await this.send(type.methods.init)
      if(this.readComplete) {
        this.type = type
        return true
      } else {
        return false
      }
    } finally {
      await this.close()
    }
  }

  /**
   * Opens the serial port with either the given baud rate or the baud rate
   * set in the ComPort's type. Once successfully open the port will be in 
   * the background state and may be used to write and read.
   * @param baud The Baud rate.
   * @returns A Promise.
   */
  async connect(baud?: number): Promise<void> {
    if(!baud && !this.type) {
      throw new Error('No baud rate set while trying to connect. Either pass the baud rate to the connect function or set a ComType first.')
    }
    if(!baud) {
      baud = this.type!.baud
    }
    this.state = 'connecting'

    this.port = new SerialPort({ 
      path: this.path, 
      baudRate: baud, 
      autoOpen: false 
    })
    
    this.port.on('error', this.receiveError.bind(this))
    this.port.on('data', this.receiveData.bind(this))

    return new Promise<void>((resolve, reject) => {
      this.port!.open((err: Error|null) => {
        if (err) {
          this.state = 'closed'
          this.lastError = err.message
          reject(err)
          return
        }
        // this.resetResponse()
        
        // Successfully opened:
        console.log(\`Connected to com port \${this.path}.\`)
        this.state = 'background'
        resolve()
      })
    })
  }

  /**
   * Read from the serial port until either the given pattern is 
   * matched in the read data or the ComPort's timeout is reached.
   * @param match The RegExp to match against read data.
   * @returns The read data.
   */
  async read(match: RegExp): Promise<string> {
    let time = Date.now()
    this.readMatch = match
    this.buffer = ''
    this.lastError = null
    this.readComplete = false
    return new Promise<string>((resolve, reject) => {
      const checkCompletion = () => {
        if( Date.now() - time > this.timeout) {
          reject(new Error(\`Timeout after \${this.timeout}ms\`))
          return
        }
        if (this.readComplete) {
          resolve(this.buffer.trim())
        } else if (this.lastError) {
          
          reject(new Error(this.lastError))
        } else {
          setTimeout(() => {
            checkCompletion()
          }, 100)
        }
      }
      checkCompletion()
    })
  }

  /**
   * Writes the given command string to the serial port.
   * @param command The command to write.
   * @returns A Promise.
   */
  async write(command: string): Promise<void> {
    if(!this.port || !this.port.isOpen) {
      throw new Error('Port not open. Please open the port via the connect function before attempting to write.')
    }

    // Asynchronously write data to the port:
    return new Promise((resolve, reject) => {
      this.port!.write(command+this.lineEnding, (err) => {
        if (err) {
          this.lastError = err.message
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  /**
   * Closes the port. If successfully closed, the port's state will
   * be closed.
   * @returns A Promise.
   */
  async close() {
    return new Promise<void>((resolve, reject) => {
      this.port?.close((err) => {
        if(!this.port!.isOpen) {
          this.port = null
          this.state = 'closed'
        }
        if(err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  async waitUntilAvailable(): Promise<void> {
    // Already available:
    if(this.state === 'background') {
      return
    }

    // If port is not connected then connect:
    if(this.state === 'closed') {
      console.log(\`Port \${this.path} is closed - connecting...\`)
      await this.connect()
    }

    // If currently connecting, first wait until connected:
    let attempt = 0
    while(this.state === 'connecting' && attempt < 10) {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 100))
      attempt++
    }
    if(this.state === 'connecting') {
      throw new Error(\`Timeout while waiting for connection to complete.\`)
    }
    console.log(\`Port \${this.path} connected.\`)

    // If busy, wait until available:
    const MAX_ATTEMPTS = 10
    attempt = 0
    while(this.state === 'busy' && attempt < MAX_ATTEMPTS) {
      console.log(\`Port \${this.path} is busy - waiting...\`)
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500))
      attempt++
    }
    if(this.state === 'busy') {
      throw new Error(\`Timeout while waiting for port to become available.\`)
    }
    console.log(\`Port \${this.path} is now available.\`)
  }


  /**
   * Executes the macros for the given method while the responses are matched.
   * After execution the com port's state will be 'background'.
   * @param method The method name to execute.
   * @return An array of the responses from each command.
   */
  async send(method: string): Promise<string[]>
  
  /**
   * Executes the given macros while the responses are matched.
   * After execution the com port's state will be 'background'.
   * @param macros The array of macros to execute.
   * @return An array of the responses from each command.
   */
  async send(macros: ComMacro[]): Promise<string[]>
  
  async send(macros: ComMacro[]|string): Promise<string[]> {
    if(typeof macros === 'string') {
      if(!this.type) {
        throw new Error(\`Cannot send to com port \${this.path} by method without a type.\`)
      }
      console.log(\`Sending macros for method '\${macros}' on port \${this.path}.\`)
      return this.send(this.type.methods[macros])
    }

    // Ensure correct state:
    if(this.state === 'busy') {
      throw new Error(\`Com port \${this.path} is busy.\`)
    }
    if(this.state === 'connecting') {
      throw new Error(\`Com port not read - please wait for connection to complete before sending.\`)
    }
    if(this.state === 'closed') {
      throw new Error(\`Com port is closed - please connect before sending.\`)
    }

    // Wait for port the become available:
    await this.waitUntilAvailable()

    // Execute each macro in turn:
    const responses = []
    for(let macro of macros) {
      this.state = 'busy'
      await this.write(macro.command)
      const response = await this.read(macro.response)
      responses.push(response)
    }

    return responses
  }

  receiveError(err: Error) {
    console.error(\`Error on port \${this.path}: \${err.message}\`)
    this.lastError = err.message

    if(this.port?.isOpen) {
      // If the error did not close the port, then return to background processing:
      this.state = 'background'
    } else {
      // If the error closed the port, then set state to closed
      // and remove the SerialPort if needed:
      this.state = 'closed'
      if(this.port) {
        this.close()
      }
    }
  }

  receiveData(data: Buffer) {
    // Log 
    if(this.state === 'background') {
      return // TODO
    }

    // Read until pattern matched:
    if(this.state === 'busy') {
      if(!this.readMatch) {
        this.lastError = 'State was busy reading data but no read RegExp was found to check for completion.'
        return
      }
      this.buffer += data.toString()

      if(this.readMatch.test(this.buffer.toString().trim())) {
        this.state = 'background'
        this.readComplete = true
      }
    }
    else {
      console.error(\`Port \${this.path} received data in unexpected state '\${this.state}': \${data.toString()}\`);
    }
  }
}
  
@named('com-manager')
class ComManager {
  ports: ComPort[] = []
  types: ComType[] = []

  @autowired('openapi-doc')
  openapiDoc:any

  constructor() {
    setTimeout(() => {
      this.init()
    }, 1000)
  }

  init() {
    this.loadTypes()
    this.scanPorts()
    .catch((err) => {
      console.error("Error initializing ComManager: ", err)
      setTimeout(() => this.init(), 1000) // retry
    })
  }

  // TODO: Allow access by ID instead of index - devices will need a name for this.
  async getComPort(typeName: string, index: number): Promise<ComPort> {
    const typePorts = this.ports.filter(p => p.type?.name === typeName)

    // Make sure the port exists and has a known type:
    if(index >= typePorts.length) {
      throw new Error(\`Port with index \${index} not found. \${typePorts.length} ports found of type \${typeName}.\`)
    }

    return typePorts[index]
  }

  async scanPorts(): Promise<void> {
    console.log(\`Scanning serial ports...\`)
    try {
        const ports = await SerialPort.list()
        ports.forEach(async p => {
          const port = new ComPort(p.path)

          port.path = p.path
          port.manufacturer = p.manufacturer
          port.serialNumber = p.serialNumber
          port.pnpId = p.pnpId
          port.locationId = p.locationId
          port.productId = p.productId
          port.vendorId = p.vendorId

          this.ports.push(port)

          // Check if the port supports one of the known com types:
          for(let type of this.types) {
            try {
              // Try to set the type:
              if(!await port.setType(type)) {
                continue
              }
              
              // If the type was set without error, then the port
              // supports this type:
              console.log(\`Com port of type \${type.name} found at path \${port.path}\`)
              break
            } catch(err) {
              console.log(\`Failed to add type to port: \${port.toString()}\`)
              console.error(err)
              continue
            }
          }
        })
        console.log(\`Found ports: \n\t\${this.ports.map(p => p.toString()).join(',\n\t')}\`);
    } catch (error: any) {
        console.error(\`Error scanning serial ports: \${error.message}\`)
    }
  }

  loadTypes() {
    Object.keys(this.openapiDoc.paths).forEach( (p:any) => {
      const path = this.openapiDoc.paths[p]
      if(path['x-bb-com-type']) {
        let baud = path['x-bb-com-type'].baud
        if(typeof baud === 'string') {
          baud = parseInt(baud)
        }

        // Methd macros:
        const methods = {} as {[method: string]: any}
        Object.keys(path)
        .filter(m => ['get', 'post', 'put', 'patch', 'delete'].includes(m))
        .filter(m => path[m]['x-bb-com-macro'])
        .forEach(m => {
          if(!path[m]['x-bb-com-macro'].commands ||
            !path[m]['x-bb-com-macro'].responses ||
            path[m]['x-bb-com-macro'].commands.length !== path[m]['x-bb-com-macro'].responses.length) 
          {
            throw new Error(\`x-bb-com-macro commands and responses must be arrays of the same length in openapi.json at path \${p}.\`)
          }
          methods[m] = (<string[]>path[m]['x-bb-com-macro'].commands).map((c, i) => (
            new ComMacro(c, new RegExp(path[m]['x-bb-com-macro'].responses[i], 'gm'))
          ))
        })

        // Init macro:
        path['x-bb-com-type'].initCommands.forEach((cmd: string, i: number) => {
          if(!methods.init) {
            methods.init = []
          }
          methods.init.push(
            new ComMacro(
              cmd,
              new RegExp(path['x-bb-com-type'].initResponses[i].replace(/^\/|\/$/g, '')) // remove leading and trailing slashes
            )
          )
        })
        if(!methods.init) {
          throw new Error(\`Com type at path \${p} is missing init commands.\`)
        }

        const comType = new ComType(
          path['x-bb-com-type'].name,
          baud,
          methods as {[method: string]: ComMacro[], init: ComMacro[]}
        )
        console.log(\`Loaded com type \${comType.toString()}\`);
        
        this.types.push(comType)
      }
    })
  }
}
`;
}


/***/ }),

/***/ "./dist/src/serviceTemplate.js":
/*!*************************************!*\
  !*** ./dist/src/serviceTemplate.js ***!
  \*************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* export default binding */ __WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils.js */ "./dist/src/utils.js");

function methodType(oasDoc, path, method, schemaToClass) {
    // If there is no response content then default to 'any':
    if (!oasDoc.paths[path][method].responses?.['200']?.content) {
        return 'void';
    }
    // Get the schema for the 200 response:
    const schema = oasDoc.paths[path][method].responses['200'].content['application/json'].schema;
    let allOf;
    if (Array.isArray(schema.allOf))
        allOf = schema.allOf;
    else if (schema.type === 'array' && schema.items && schema.items.allOf)
        allOf = schema.items.allOf;
    let type = '';
    if (allOf) {
        type = allOf
            .map((childSchema) => schemaToClass[childSchema['$ref']])
            .join('&');
    }
    else if (schema.type === 'array' && schema.items && schema.items['$ref']) {
        type = schemaToClass[schema.items['$ref']];
    }
    else if (schema['$ref']) {
        type = schemaToClass[schema['$ref']];
    }
    else if (typeof schema.type === 'string') {
        type = schema.type;
    }
    if (type && schema.type === 'array') {
        return type + '[]';
    }
    else if (type) {
        return type;
    }
    else {
        console.log(`No type found for ${method} ${path}, defaulting to 'void'.`);
        return 'void';
    }
}
/* harmony default export */ function __WEBPACK_DEFAULT_EXPORT__(openapiDoc, { bbName, serviceName, methods }) {
    const className = (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.toCammelCase)(serviceName);
    const classVarName = (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.toCammelCase)(serviceName, false);
    const schemaToClass = (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.schemaToClassMap)(openapiDoc);
    let imports = '';
    new Set(methods // use a set to remove duplicates
        .map(method => methodType(openapiDoc, method.path, method.method, schemaToClass)) // extract types from methods
        .filter(type => type) // remove empty - shouldn't happen???
        .filter(type => !_utils_js__WEBPACK_IMPORTED_MODULE_0__.jsonTypes.includes(type)) // remove primitives
        .map((type) => type.endsWith('[]') ? type.substring(0, type.length - 2) : type)
        .reduce((classes, type) => classes.concat(type.split('&')), []) // split Type1&Type2
        .reduce((classes, type) => classes.concat(type.split('|')), []) // split Type1|Type2
    ).forEach(type => imports += `import ${type} from '${_utils_js__WEBPACK_IMPORTED_MODULE_0__.reservedClasses.includes(type) ? '../gensrc/' : './'}${type}.js'\n`);
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
  ${methods.map(method => {
        const pathParams = (method.path.match(/{(.*?)}/g) || []).map((p) => p.substring(1, p.length - 1));
        if (['post', 'put', 'patch'].includes(method.method)) {
            pathParams.push('data');
        }
        const pathParamsList = pathParams.length > 0 ? '{' + pathParams.join(', ') + '}' : '';
        const serviceType = openapiDoc.paths[method.path][method.method].requestBody?.content?.['application/json']?.schema?.$ref ?
            schemaToClass[openapiDoc.paths[method.path][method.method].requestBody.content['application/json'].schema.$ref] :
            schemaToClass[openapiDoc.paths[method.path][method.method].requestBody?.content?.['application/json']?.schema?.type] ?
                schemaToClass[openapiDoc.paths[method.path][method.method].requestBody.content['application/json'].schema.type] :
                'any';
        const pathParamTypes = pathParams.length > 0 ? '{' + pathParams.map(p => `${p}: ${p === 'data' ? serviceType : p.endsWith('index') ? 'number' : 'string'}`).join(', ') + '}' : '';
        const returnType = methodType(openapiDoc, method.path, method.method, schemaToClass);
        return `
  async ${method.operationId}(${pathParamsList}${pathParams.length > 0 ? ': ' : ''}${pathParamTypes}): Promise<${returnType}> {
    const port = await this.comManager.getComPort('${bbName}', 0)
    const responses = await port.send('${method.method}')

    // TODO: Process responses to extract data.

    throw new Error(\`${method.operationId} not yet implemented.\`)
  }`;
    }).join('\n')}
}
`;
}


/***/ }),

/***/ "./dist/src/utils.js":
/*!***************************!*\
  !*** ./dist/src/utils.js ***!
  \***************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CONFIG_FILENAME: () => (/* binding */ CONFIG_FILENAME),
/* harmony export */   OPENAPI_FILENAME: () => (/* binding */ OPENAPI_FILENAME),
/* harmony export */   PACKAGE_FILENAME: () => (/* binding */ PACKAGE_FILENAME),
/* harmony export */   extractPathParams: () => (/* binding */ extractPathParams),
/* harmony export */   get: () => (/* binding */ get),
/* harmony export */   httpMethods: () => (/* binding */ httpMethods),
/* harmony export */   jsonTypes: () => (/* binding */ jsonTypes),
/* harmony export */   makeContentSchema: () => (/* binding */ makeContentSchema),
/* harmony export */   pathParamRegex: () => (/* binding */ pathParamRegex),
/* harmony export */   reservedClasses: () => (/* binding */ reservedClasses),
/* harmony export */   reservedTypes: () => (/* binding */ reservedTypes),
/* harmony export */   schemaToClassMap: () => (/* binding */ schemaToClassMap),
/* harmony export */   toCammelCase: () => (/* binding */ toCammelCase)
/* harmony export */ });
/* harmony import */ var node_http__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! node:http */ "node:http");
/* harmony import */ var node_https__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! node:https */ "node:https");
// TODO: Move this to a shared package for blackbox-cli and extensions.


/**
 * Convert a string to CamelCase.
 * @param name The string to convert.
 * @param startUpper Whether to start with an upper case letter. Default true.
 * @returns The CamelCased string.
 */
function toCammelCase(name, startUpper = true) {
    if (jsonTypes.includes(name) || name.endsWith('[]') && jsonTypes.includes(name.substring(0, name.length - 2))) {
        return name;
    }
    else {
        const cc = name.replace(/([-_][a-z])/ig, ($1) => {
            return $1.toUpperCase()
                .replace('-', '')
                .replace('_', '');
        });
        if (startUpper) {
            return cc.charAt(0).toUpperCase() + cc.substring(1);
        }
        else {
            return cc;
        }
    }
    // name.split('-')
    //   .map((part, i) => i > 0 || startUpper ? part.charAt(0).toUpperCase() + part.substring(1) : part)
    //   .join('')
}
/**
 * Create an OpenAPI content schema for a given datatype using either
 * a native type or a $ref to a specified type.
 * @param datatype
 * @returns
 */
function makeContentSchema(datatype) {
    return jsonTypes.includes(datatype) ?
        { "type": datatype } :
        { "$ref": "#/components/schemas/" + datatype };
}
const OPENAPI_FILENAME = "openapi.json";
const CONFIG_FILENAME = "blackbox.json";
const PACKAGE_FILENAME = "package.json";
const jsonTypes = [
    "string",
    "integer",
    "number",
    "boolean",
    "array",
    "object",
    "any",
    "void"
];
const httpMethods = [
    "get",
    "put",
    "post",
    "delete",
    "options",
    "patch"
];
const reservedTypes = [
    "metadata",
    "index-response",
    "service",
    "service-list",
    "oas3schema"
];
reservedTypes.push(...jsonTypes);
const reservedClasses = reservedTypes.map(t => toCammelCase(t));
// export const importMap = {
//   Service: 'blackbox-services',
//   ServiceLinks: 'blackbox-services',
//   ServiceLink: 'blackbox-services',
//   ServiceType: 'blackbox-services',
// }
const pathParamRegex = /\{([^}]+)\}/g;
/**
 * Extract the path parameters from a path string.
 * @param path The path string.
 * @returns An array of parameter names.
 */
function extractPathParams(path) {
    const params = [];
    const regex = pathParamRegex;
    let match;
    while ((match = regex.exec(path)) !== null) {
        params.push(`${match[1]}`);
    }
    return params;
}
function schemaToClassMap(oasDoc) {
    return Object.keys(oasDoc.components.schemas).reduce((map, schemaName) => {
        // Remove non-words (e.g. hyphens):
        const tokens = schemaName.match(/\w+/g);
        if (!tokens)
            throw new Error(`Invalid schema found '${schemaName}'`);
        // Convert to camel-case:
        map[`#/components/schemas/${schemaName}`] = tokens.reduce((className, t) => className + t.charAt(0).toUpperCase() + t.substring(1), '');
        return map;
    }, {});
}
function get(url) {
    return new Promise((resolve, reject) => {
        (url.startsWith('https') ? node_https__WEBPACK_IMPORTED_MODULE_1__ : node_http__WEBPACK_IMPORTED_MODULE_0__).get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers,
                    data: JSON.parse(data)
                });
            });
            res.on('error', (err) => {
                reject(err);
            });
        });
    });
}


/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire_require("fs");

/***/ }),

/***/ "node:http":
/*!****************************!*\
  !*** external "node:http" ***!
  \****************************/
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire_require("node:http");

/***/ }),

/***/ "node:https":
/*!*****************************!*\
  !*** external "node:https" ***!
  \*****************************/
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire_require("node:https");

/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __webpack_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__webpack_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/******/ /* webpack/runtime/make namespace object */
/******/ (() => {
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = (exports) => {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/ })();
/******/ 
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!***********************!*\
  !*** ./dist/index.js ***!
  \***********************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ BBComExtension)
/* harmony export */ });
/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! fs */ "fs");
/* harmony import */ var _src_ComPortTemplate_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./src/ComPortTemplate.js */ "./dist/src/ComPortTemplate.js");
/* harmony import */ var _src_serviceTemplate_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./src/serviceTemplate.js */ "./dist/src/serviceTemplate.js");



function logp(message) {
    console.log(message);
}
function logerror(message) {
    console.error(message);
}
class BBComExtension {
    config;
    bbDoc;
    openapiDoc;
    constructor(config, // CliConfig
    bbDoc, openapiDoc) {
        this.config = config;
        this.bbDoc = bbDoc;
        this.openapiDoc = openapiDoc;
    }
    getConfig() {
        return {
            name: "bb-com-extension",
            types: {
                'com-type': 'Type of serial device.',
                'com-macro': 'A macro to send over the serial link.',
                'com-service': 'A service to manage serial communications.'
            },
            options: {
                '--init-commands <string>': 'The serial command to send to initialise the device.',
                '--init-responses <string>': 'The expected response from the device after sending the init command, given as a regular expression.',
                '--commands <string>': 'The sequence of commands to send in the macro, separated by semicolons.',
                '--responses <string>': 'Expected responses for each command given as regular expressions, separated by semicolons.',
                '--baud <string>': 'The baud rate for the serial connection.',
                '--method <string>': 'The HTTP method to use (GET, POST, etc.) for a macro.'
            }
        };
    }
    add(type) {
        if (type === 'com-type') {
            this.addType();
        }
        else if (type === 'com-macro') {
            this.addMacro();
        }
    }
    /**
     * bb add com-type --path /serial --baud 9600 --init "INIT_CMD" --init-response "/OK/"
     */
    addType() {
        if (!this.config.path) {
            // TODO: Share the types and utils from blackbox-cli.
            logerror("Please provide a path for the com using --path.");
            return;
        }
        const path = this.openapiDoc.paths[this.config.path];
        if (!path) {
            logerror(`Path ${this.config.path} not found in OpenAPI document.`);
            return;
        }
        path['x-bb-com-type'] = {
            name: this.config.name,
            baud: this.config.baud,
            initCommands: this.config.initCommands.split(';'),
            initResponses: this.parseResponses(this.config.initResponses)
        };
        logp(`Added com type 'serial' at path '${this.config.path}' with baud rate ${path['x-bb-com-type'].baud}.`);
    }
    /**
     * bb add com-macro --path init --commands "CMD1;CMD2;CMD3" --responses "/RESP1/;/RESP2/;/RESP3/"
     */
    addMacro() {
        if (!this.config.path) {
            logerror("Please provide a path for the macro using --path.");
            return;
        }
        const path = this.openapiDoc.paths[this.config.path];
        if (!path) {
            logerror(`Path ${this.config.path} not found in OpenAPI document.`);
            return;
        }
        const method = this.config.method;
        if (!method || !path[method.toLowerCase()]) {
            logerror(`Method '${method}' not found at path ${this.config.path} in OpenAPI document.`);
            return;
        }
        if (path[method.toLowerCase()]['x-bb-com-macro']) {
            logerror(`A com macro already exists at path ${this.config.path} for method ${method}.`);
            return;
        }
        if (!this.config.commands || !this.config.responses) {
            logerror("Please provide both commands and responses for the macro using --commands and --responses.");
            return;
        }
        // Extract the responses as regular expressions.
        // Responses will be in the form: /response1/;/response2/;/response3/
        // although the semi-colons are optional.
        const macroDef = {
            commands: this.config.commands.split(';'),
            responses: this.parseResponses(this.config.responses)
        };
        path[method.toLowerCase()]['x-bb-com-macro'] = macroDef;
        logp(`Added com macro at path '${this.config.path}' with ${macroDef.commands.length} command(s).`);
    }
    parseResponses(responsesStr) {
        const regex = /(\/[^\/]+\/)/gm;
        let m;
        const responses = [];
        while ((m = regex.exec(responsesStr)) !== null) {
            // This is necessary to avoid infinite loops with zero-width matches
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            // The result can be accessed through the `m`-variable.
            m.forEach((match, groupIndex) => {
                console.log(`Found match, group ${groupIndex}: ${match}`);
                if (groupIndex === 1) {
                    responses.push(match);
                }
            });
        }
        return responses;
    }
    delete(type) {
        console.log(`Deleting com of type '${type} - NOT YET IMPLEMENTED.`);
    }
    generate(type) {
        if (type !== 'com-service') {
            logerror(`Generation for type '${type}' not supported.`);
            return;
        }
        console.log(`Generating service for com of type '${type}...' `);
        // Create ComPort.ts if it doesn't exist:
        if (!fs__WEBPACK_IMPORTED_MODULE_0__.existsSync('gensrc/ComPort.ts')) {
            fs__WEBPACK_IMPORTED_MODULE_0__.writeFileSync('gensrc/ComPort.ts', (0,_src_ComPortTemplate_js__WEBPACK_IMPORTED_MODULE_1__["default"])());
        }
        // Add serialport to package.json dependencies if not already present:
        const packageJson = JSON.parse(fs__WEBPACK_IMPORTED_MODULE_0__.readFileSync('package.json', 'utf-8'));
        if (!packageJson.dependencies) {
            packageJson.dependencies = {};
        }
        if (!packageJson.dependencies['serialport']) {
            packageJson.dependencies['serialport'] = '^13.0.0';
            fs__WEBPACK_IMPORTED_MODULE_0__.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
            logp("Added 'serialport' to package.json dependencies.");
        }
        // Generate services for each path with a com-type:
        Object.keys(this.openapiDoc.paths).forEach(path => {
            if (!this.openapiDoc.paths[path]['x-bb-com-type']) {
                return;
            }
            const serviceName = path.substring(path.lastIndexOf('/') + 1);
            const serviceFileName = `src/${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}Service.ts`;
            if (fs__WEBPACK_IMPORTED_MODULE_0__.existsSync(serviceFileName)) {
                logp(`Service file ${serviceFileName} already exists - skipping generation.`);
                return;
            }
            const serviceCode = (0,_src_serviceTemplate_js__WEBPACK_IMPORTED_MODULE_2__["default"])(this.openapiDoc, {
                serviceName,
                bbName: this.openapiDoc.paths[path]['x-bb-com-type'].name,
                methods: Object.keys(this.openapiDoc.paths[path])
                    .filter((method) => ['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase()))
                    .reduce((methods, method) => {
                    if (this.openapiDoc.paths[path][method]['x-bb-com-macro']) {
                        const operationId = this.openapiDoc.paths[path][method].operationId;
                        methods.push({
                            path,
                            method,
                            operationId
                        });
                    }
                    return methods;
                }, [])
            });
            fs__WEBPACK_IMPORTED_MODULE_0__.writeFileSync(serviceFileName, serviceCode);
            logp(`Generated com service class ${serviceFileName}.`);
        });
    }
}

})();

const __webpack_exports__default = __webpack_exports__["default"];
export { __webpack_exports__default as default };
