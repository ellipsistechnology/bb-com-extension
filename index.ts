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
        if(!this.config.path) {
            // TODO: Share the types and utils from blackbox-cli.
            logerror("Please provide a path for the com using --path.")
            return
        }
        const path = this.openapiDoc.paths[this.config.path]
        if(!path) {
            logerror(`Path ${this.config.path} not found in OpenAPI document.`)
            return
        }
        path['x-bb-com-type'] = {
            name: this.config.name,
            baud: this.config.baud,
            initCommands: this.config.initCommands,
            initResponses: this.parseResponses(this.config.initResponses)
        }
        logp(`Added com type 'serial' at path '${this.config.path}' with baud rate ${path['x-bb-com-type'].baud}.`)
    }

    /**
     * bb add com-macro --path init --commands "CMD1;CMD2;CMD3" --responses "/RESP1/;/RESP2/;/RESP3/"
     */
    addMacro() {
        if(!this.config.path) {
            logerror("Please provide a path for the macro using --path.")
            return
        }
        const path = this.openapiDoc.paths[this.config.path]
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

        // Extract the responses as regular expressions.
        // Responses will be in the form: /response1/;/response2/;/response3/
        // although the semi-colons are optional.
        const macroDef = {
            commands: this.config.commands.split(';'),
            responses: this.parseResponses(this.config.responses)
        }
        path[method.toLowerCase()]['x-bb-com-macro'] = macroDef
        logp(`Added com macro at path '${this.config.path}' with ${macroDef.commands.length} command(s).`)
    }

    private parseResponses(responsesStr: any) {
        const regex = /(\/[^\/]+\/)/gm
        let m
        const responses: string[] = []
        while ((m = regex.exec(responsesStr)) !== null) {
            // This is necessary to avoid infinite loops with zero-width matches
            if (m.index === regex.lastIndex) {
                regex.lastIndex++
            }

            // The result can be accessed through the `m`-variable.
            m.forEach((match, groupIndex) => {
                console.log(`Found match, group ${groupIndex}: ${match}`)
                if (groupIndex === 1) {
                    responses.push(match)
                }
            })
        }
        return responses
    }

    delete(type: string) {
        console.log(`Deleting com of type '${type}`);
    }

    generate(type: string) {
        console.log(`Generating com of type '${type}`);
    }
}