# bb-com-extension

Blackbox CLI extension for creating serial (COM) based integrations in a Blackbox project.
It is built around the [ellipsis-com](https://www.npmjs.com/package/ellipsis-com) library for serial communications.

This extension adds custom Blackbox types and commands for:
- defining COM device types,
- attaching COM macros to OpenAPI operations,
- generating a COM loader utility.

## What this extension adds

When installed into a Blackbox project, this extension contributes:

- Types:
	- `com-type` — Type of serial device.
	- `com-macro` — A macro to send over the serial link.
	- `com-utils` — Helper utilities for serial communications.
- Commands supported by this extension:
	- `add`
	- `delete` (currently placeholder / not implemented)
	- `generate`

## Install

### 1) Install package (project-local)

From your Blackbox project directory:

```bash
npm install --save-dev bb-com-extension
```

### 2) Register extension with blackbox-cli

```bash
bb add extension -p bb-com-extension
```

This stores extension metadata in your `blackbox.json`.

## Usage

### Add a COM type

Creates/updates `x-bb-com-types.<name>` in `openapi.json`.

```bash
bb add com-type \
	--name sensor-a \
	--baud 9600 \
	--init-commands "ATZ;ATE0" \
	--init-responses "/OK/;/READY/" \
	--startup-delay 1000
```

Notes:
- `--init-commands` is semicolon-separated.
- `--init-responses` is semicolon-separated regex entries in slash form.
- `--init-commands` and `--init-responses` must have the same number of entries.

### Add a COM macro to an operation

Attaches `x-bb-com-macro` to a specific OpenAPI path + HTTP method.

```bash
bb add com-macro \
	--name sensor-a \
	--path /devices/#/readings \
	--method get \
	--commands "READ;STATUS" \
	--responses "/TEMP:.*/;/OK/"
```

Notes:
- `--path` uses Blackbox path format (`#` placeholders for path params).
- Method must exist on the matched OpenAPI path.
- Only one COM macro per path/method is allowed.
- `--responses` is semicolon-separated regex entries in slash form.
- `--commands` and `--init-responses` must have the same number of entries.

### Generate COM utilities

```bash
bb generate com-utils
```

This will:
- create `gensrc/ComLoader.ts` if it does not already exist,
- add `ellipsis-com` to `package.json` dependencies (if missing).

Then run:

```bash
npm install
```

## OpenAPI extensions produced

### `x-bb-com-types`

Added at the document root:

```json
{
	"x-bb-com-types": {
		"sensor-a": {
			"baud": 9600,
			"startupDelay": 1000,
			"initCommands": ["ATZ", "ATE0"],
			"initResponses": ["OK", "READY"]
		}
	}
}
```

### `x-bb-com-macro`

Added at operation level:

```json
{
    "paths": {
        "/service/path": {
            "get": {
                "operationId": "getThing",
                "x-bb-com-macro": {
                    "type": "sensor-a",
                    "commands": ["READ", "STATUS"],
                    "responses": ["TEMP:.*", "OK"]
                }
            }
        }
    }
}
```

## COM loader utility

The generated `ComLoader.ts` provides a `ComLoader` class that can be used to initialise and manage COM device connections based on the defined types and macros in your OpenAPI spec. It uses the `ellipsis-com` library to handle serial communications, sending init commands, and matching responses according to the configurations specified in your OpenAPI document.

The loader class will:
- Read COM type definitions from `x-bb-com-types`.
- Read COM macro definitions from `x-bb-com-macro`.
- Create and initialise a ComManager from the `ellipsis-com` library.

The ComManager can then be used to:
- Connect to devices based on the defined COM types.
- Send macro commands by referencing the macro name defined in `x-bb-com-macro`.

Example usage of the generated `ComLoader`:

```typescript
@serviceClass('comm')
export class CommService {

  @autowired('openapi-doc')
  openapiDoc: any

  @autowired('com-manager')
  comManager!: ComManager

  constructor() {
  }

  async getComm(): Promise<string> {
    const port = this.comManager.getComPort('sensor-a', 0) // Get the first port of type 'sensor-a'.
    const responses = await port.send('getThing') // Send macro by operationId.
    return responses[0]
  }

  async createComm({data}: {data: any}): Promise<string> {
    const port = this.comManager.getComPort('com1', 0)
    const responses = await port.send('createThing', {data})
    return responses[0]
  }
}

```

## Option reference

- `--init-commands <string>`: Serial init commands, semicolon-separated.
- `--init-responses <string>`: Expected init responses as slash-wrapped regex entries, semicolon-separated.
- `--commands <string>`: Macro commands, semicolon-separated.
- `--responses <string>`: Macro responses as slash-wrapped regex entries, semicolon-separated.
- `--baud <string>`: Baud rate.
- `--method <string>`: HTTP method (`get`, `post`, `put`, `patch`, `delete`).
- `--startup-delay <number>`: Delay (ms) before init commands.

## Behavior notes

- COM loader uses OpenAPI `operationId` values to map macros.
- Missing `operationId` for an operation with `x-bb-com-macro` will throw an error.
- Regex flags are supported in init responses when provided as `/pattern/flags`.
- `delete` for extension types is currently not implemented.

## Development

Build:

```bash
npm run build
```

Watch/dev build:

```bash
npm run dev-build
```

## License

ISC
