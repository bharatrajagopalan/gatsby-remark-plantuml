"use strict"

const Promise = require(`bluebird`)
const path = require(`path`)
const { spawn } = require(`child_process`)
const hasbin = require(`hasbin`)
const visit = require(`unist-util-visit`)
const { StringStream, readableToString, onExit } = require(`@rauschma/stringio`)
const cheerio = require(`cheerio`)

class PlantUmlError extends Error {
  constructor(message, lineNumber, generalError) {
    super(message)

    this.type = `PlantUmlError`
    this.name = `PlantUmlError`

    this.lineNumber = lineNumber
    this.generalError = generalError
  }

  toString() {
    return `${this.message} at line ${this.lineNumber} ${this.generalError}`
  }
}

class Configuration {
  static DEFAULT_JAVA_OPTS = [`-Djava.awt.headless=true`]

  static DEFAULT_PLANTUML_OPTS = [
    `-charset`,
    `UTF-8`,
    `-Dfile.encoding=utf8`,
    `-pipe`,
    `-pipeNoStderr`,
    `-tsvg`,
  ]

  constructor() {
    this.hasJava = false
    this.hasGraphViz = false
    this.hasNotRun = true
    this.plantumljar = path.resolve(
      __dirname,
      `./lib/plantuml-jar-mit-1.2020.15/plantuml.jar`
    )
    this.JAVA_OPTS = []
    this.PLANTUML_OPTS = []
  }

  init({ pluginOptions, reporter }) {
    this.reporter = reporter
    if (this.hasNotRun) {
      if (pluginOptions.JAVA_OPTS) {
        this.JAVA_OPTS = pluginOptions.JAVA_OPTS
      }
      if (pluginOptions.PLANTUML_OPTS) {
        this.PLANTUML_OPTS = pluginOptions.PLANTUML_OPTS
      }
      if (pluginOptions.plantumljar) {
        this.plantumljar = path.resolve(__dirname, pluginOptions.plantumljar)
      }

      this.hasNotRun = false
      this.hasJava = this.checkForJava()
      this.hasGraphViz = this.checkForGraphVis()
    }
  }

  getCommandLineArguments() {
    return [
      ...Configuration.DEFAULT_JAVA_OPTS,
      ...this.JAVA_OPTS,
      `-jar`,
      configuration.plantumljar,
      ...Configuration.DEFAULT_PLANTUML_OPTS,
      ...this.PLANTUML_OPTS,
    ]
  }

  checkForJava() {
    return hasbin.sync(`java`)
  }

  checkForGraphVis() {
    return hasbin.sync(`dot`)
  }

  check() {
    return this.hasJava && this.hasGraphViz
  }

  logNoExecutable(exe) {
    this.reporter.warn(`Executable '${exe}' not found on path`)
  }

  logJavaProblems() {
    if (!this.hasJava) {
      this.logNoExecutable(`java`)
    }
  }

  logGraphVizProblems() {
    if (!this.hasGraphViz) {
      this.logNoExecutable(`dot`)
    }
  }

  logProblems() {
    this.logJavaProblems()
    this.logGraphVizProblems()
  }
}

const configuration = new Configuration()

const plantuml = async (gatsbyNodeHelpers, options) => {
  const defaultPluginOptions = {
    stripEmbeddedCopy: true,
    stripXmlNamespace: true,
  }
  const pluginOptions = {
    ...defaultPluginOptions,
    ...options,
  }

  const { markdownAST, reporter } = gatsbyNodeHelpers
  const plantUmlNodes = []

  const runplantuml = async (diagramAsText) => {
    const args = configuration.getCommandLineArguments()
    const plantumlProcess = spawn(`java`, args)

    const diagramAsStream = new StringStream(diagramAsText)

    // setup up sinks before piping data in
    const onExitPromise = onExit(plantumlProcess)
    const stdoutPromise = readableToString(plantumlProcess.stdout)
    const stderrPromise = readableToString(plantumlProcess.stderr)

    await diagramAsStream.pipe(plantumlProcess.stdin)
    const stdout = await stdoutPromise
    const stderr = await stderrPromise

    let executableFailed = false
    try {
      await onExitPromise
    } catch (e) {
      executableFailed = true
    }

    if (executableFailed) {
      if (stderr && !stdout) {
        throw new Error(stderr)
      }

      /*
        PlantUML Error message format (undocumented)

        ERROR
        <line number> // 1 is the line after @startuml
        <message>
        <general message>
      */
      const [_marker, lineNumberAsText, errorLine, ...rest] = stdout.split(
        /\n|\r\n/
      )
      const message = errorLine.replace(`?`, ``)
      const lineNumber = Number.parseInt(lineNumberAsText, 10)
      const generalError = rest.join(`\n`)

      throw new PlantUmlError(message, lineNumber, generalError)
    }

    let svg = stdout.replace(/<\?xml [\s\S]*\?>/m, ``)

    return svg
  }

  configuration.init({ pluginOptions, reporter })

  visit(markdownAST, `code`, (node) => {
    const lang = node.lang
    const attrString = node.meta

    // Visit must be SYNC
    // See https://www.huy.dev/2018-05-remark-gatsby-plugin-part-3/
    //
    // Gatsby Remark Images also shows how to do async code in transformers.
    // https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-remark-images/src/index.js
    if (lang === `plantuml`) {
      plantUmlNodes.push({ node, attrString: attrString })
    }

    return node
  })

  if (plantUmlNodes.length === 0) {
    return
  }

  if (!configuration.check()) {
    configuration.logProblems()
    return
  }

  const generateUmlAndUpdateNode = async ({ node, attrString }) => {
    const diagramAsText = node.value

    try {
      const diagramAsSvg = await runplantuml(diagramAsText)
      const $ = cheerio.load(diagramAsSvg)

      if (pluginOptions.stripXmlNamespace) {
        $(`svg`).removeAttr(`xmlns`)
        $(`svg`).removeAttr(`xlink`)
      }

      // Set max width
      if (pluginOptions.maxWidth) {
        $(`svg`).attr(`width`, pluginOptions.maxWidth)
        $(`svg`).attr(`height`, `auto`)
      }

      // Add default inline styling
      $(`svg`).attr(`style`, `max-width: 100%; height: auto;`)

      // Merge custom attributes if provided by pluginOptions or specific code fence
      const elementAttributes = attrString || pluginOptions.attributes
      if (elementAttributes) {
        const attrElement = cheerio.load(
          `<element ${elementAttributes}></element>`
        )
        $(`svg`).attr(attrElement(`element`).attr())
      }

      node.type = `html`
      node.lang = undefined
      node.children = undefined
      node.value = $.html(`svg`)

      if (pluginOptions.stripEmbeddedCopy) {
        node.value = node.value.replace(/<!--[\s\S]*-->/m, ``)
      }
    } catch (err) {
      let specificReason = ``
      if (err instanceof PlantUmlError) {
        specificReason = err.toString()
        const { lineNumber } = err
        const diagramAsTextLines = diagramAsText.split(/\n|\r\n/)

        const CONTEXT_SIZE = 2
        const startLineNumber = Math.max(0, lineNumber - CONTEXT_SIZE)
        const endLineNumber = Math.min(
          diagramAsTextLines.length - 1,
          lineNumber + CONTEXT_SIZE
        )

        const contextAsLines = []
        for (let i = startLineNumber; i <= lineNumber; i += 1) {
          contextAsLines.push(
            `${i.toString().padStart(5)} ${diagramAsTextLines[i]}`
          )
        }
        contextAsLines.push(`^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^`)
        contextAsLines.push(err.toString())

        for (let i = lineNumber + 1; i <= endLineNumber; i += 1) {
          contextAsLines.push(
            `${i.toString().padStart(5)} ${diagramAsTextLines[i]}`
          )
        }

        const context = contextAsLines.join(`\n`)

        node.type = `html`
        node.lang = undefined
        node.children = undefined
        node.value = `<p><b><span style="color:red">PlantUmlError</span></b></p>
<pre>
${context}
</pre>
`
      }

      reporter.error(
        `Could not generate plantuml diagram: ${specificReason} `,
        err
      )
    }
  }

  await Promise.each(plantUmlNodes, generateUmlAndUpdateNode)
}

const plantumlModule = (module.exports = plantuml)
plantumlModule.PlantUmlError = PlantUmlError
plantumlModule.Configuration = Configuration
