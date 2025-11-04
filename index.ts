import fs from 'fs'
import comPortTemplate from './src/ComPortTemplate.js'

function logp(message: string) {
    console.log(message)
}

function logerror(message: string) {
    console.error(message)
}

export default class BBComExtension {
    constructor(
        public config: any, // CliConfig
        public bbDoc: any,
        public openapiDoc: any
    ) {}

    getConfig() {
        return {
            name: "bb-com-extension",
            types: {
                'com-type': 'Type of serial device.', 
                'com-macro': 'A macro to send over the serial link.',
                'com-utils': 'Helper utilities for accessing serial communications.'
            },
            options: {
                '--init-commands <string>': 'The serial command to send to initialise the device.',
                '--init-responses <string>': 'The expected response from the device after sending the init command, given as a regular expression.',
                '--commands <string>': 'The sequence of commands to send in the macro, separated by semicolons.',
                '--responses <string>': 'Expected responses for each command given as regular expressions, separated by semicolons.',
                '--baud <string>': 'The baud rate for the serial connection.',
                '--method <string>': 'The HTTP method to use (GET, POST, etc.) for a macro.'
            }
        }
    }

    add(type: string) {
        if(type === 'com-type') {
            this.addType()
        } else if(type === 'com-macro') {
            this.addMacro()
        }
    }

    /**
     * bb add com-type --path /serial --baud 9600 --init "INIT_CMD" --init-response "/OK/"
     */
    addType() {
        if(!this.openapiDoc['x-bb-com-types']) {
            this.openapiDoc['x-bb-com-types'] = {}
        }
        this.openapiDoc['x-bb-com-types'][this.config.name] = {
            baud: this.config.baud,
            initCommands: this.config.initCommands.split(';'),
            initResponses: this.parseResponses(this.config.initResponses)
        }
        logp(`Added com type '${this.config.name}'.`)
    }

    /**
     * bb add com-macro --path init --commands "CMD1;CMD2;CMD3" --responses "/RESP1/;/RESP2/;/RESP3/"
     */
    addMacro() {
        if(!this.config.path) {
            logerror("Please provide a path for the macro using --path.")
            return
        }
        const openApiPath = this.blackboxToOpenapiPath(this.config.path)
        if(!openApiPath) {
            logerror(`Path ${this.config.path} not found in OpenAPI document.`)
            return
        }
        const path = this.openapiDoc.paths[openApiPath]
        if(!path) {
            logerror(`Path ${this.config.path} not found in OpenAPI document.`)
            return
        }
        const method = this.config.method
        if(!method || !path[method.toLowerCase()]) {
            logerror(`Method '${method}' not found at path ${this.config.path} in OpenAPI document.`)
            return
        }
        if(path[method.toLowerCase()]['x-bb-com-macro']) {
            logerror(`A com macro already exists at path ${this.config.path} for method ${method}.`)
            return
        }
        if(!this.config.commands || !this.config.responses) {
            logerror("Please provide both commands and responses for the macro using --commands and --responses.")
            return
        }

        const macroDef = {
            name: this.config.name,
            commands: this.config.commands.split(';'),
            responses: this.parseResponses(this.config.responses)
        }
        path[method.toLowerCase()]['x-bb-com-macro'] = macroDef
        logp(`Added com macro at path '${this.config.path}' with ${macroDef.commands.length} command(s).`)
    }

    /**
     * Extract the responses as regular expressions.
     * Responses will be in the form: /response1/;/response2/;/response3/
     * @param responsesStr 
     * @returns 
     */
    private parseResponses(responsesStr: any) {
        if(!responsesStr.startsWith('/') || !responsesStr.endsWith('/')) {
            logerror("Responses must be provided as regular expressions enclosed in slashes (/).")
            return []
        }
        return responsesStr.substring(1, responsesStr.length - 1).split('/;/').map( (resp: string) => resp.trim() )
    }

    delete(type: string) {
        console.log(`Deleting com of type '${type} - NOT YET IMPLEMENTED.`);
    }
    
    blackboxToOpenapiPath(bbPath: string) {
        for(let p in this.openapiDoc.paths) {
            if(p.replaceAll(/\{[^}]+\}/gm, '#') === bbPath) {
                return p
            }
        }
        return undefined
    }

    generate(type: string) {
        if(type !== 'com-utils') {
            logerror(`Generation for type '${type}' not supported.`)
            return
        }

        // Create ComPort.ts if it doesn't exist:
        if(!fs.existsSync('gensrc/ComPort.ts')) {
            fs.writeFileSync('gensrc/ComPort.ts', comPortTemplate())
            logp("Generated gensrc/ComPort.ts for serial communications.")
        }

        // Add serialport to package.json dependencies if not already present:
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
        if(!packageJson.dependencies) {
            packageJson.dependencies = {}
        }
        if(!packageJson.dependencies['serialport']) {
            packageJson.dependencies['serialport'] = '^13.0.0'
            fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2))
            logp("Added 'serialport' to package.json dependencies.\nPlease run 'npm install' to install the new dependency.")
        }
/*
        // Generate services for each path with a com-type:
        Object.keys(this.openapiDoc.paths).forEach( path => {

            // Skip if the service file already exists:
            const serviceName = path.substring(path.lastIndexOf('/')+1)
            const serviceFileName = `src/${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}Service.ts`
            if(fs.existsSync(serviceFileName)) {
                logp(`Service file ${serviceFileName} already exists - skipping generation.`)
                return
            }

            const parentPathObj = this.openapiDoc.paths[path]
            const comType = parentPathObj['x-bb-com-type']
            if(!comType) {
                return
            }

            // Extract methods for the parent service node:
            const methods = Object.keys(parentPathObj)
                .filter((method: string) => ['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase()))
                .reduce((methods: any[], method) => {
                    if (parentPathObj[method]['x-bb-com-macro']) {
                        const operationId = parentPathObj[method].operationId
                        methods.push({
                            path,
                            method,
                            operationId
                        })
                    }
                    return methods
                }, [])

            // Extract methods for the child object nodes:
            if(parentPathObj['x-bb-service']?.access !== 'unique') {
                Object.keys(this.openapiDoc.paths)
                    .filter( p => p.startsWith(path+'/') ) // child nodes
                    .forEach( p => {
                        const pathObj = this.openapiDoc.paths[p]
                        Object.keys(pathObj)
                        .filter((method: string) => ['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase()))
                        .filter( method => !pathObj[method]['x-bb-com-macro']?.name || pathObj[method]['x-bb-com-macro'].name === comType.name) // Either the name is not specific (default to parent) or it matches the com-type name of the parent.
                        .forEach( method => {
                            if (pathObj[method]['x-bb-com-macro']) {
                                const operationId = pathObj[method].operationId
                                methods.push({
                                    path: p,
                                    method,
                                    operationId
                                })
                            }
                        })
                    })
            }

            // Generate service code:
            const serviceCode = serviceTemplate(this.openapiDoc, {
                serviceName,
                bbName: comType.name,
                methods: methods
            })

            // Write service file:
            fs.writeFileSync(serviceFileName, serviceCode)
            logp(`Generated com service class ${serviceFileName}.`)
        })*/
    }
}