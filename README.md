# gatsby-remark-plantuml #

Gatsby Remark plugin to transform [PlantUML][PlantUML] code blocks into SVG images.

## Install ##

```
npm install --save  gatsby-remark-plantuml
```

**Note:** `gatsby-transformer-remark` or `gatsby-plugin-mdx` must already be installed and configured in your gatsby installation.

### Prerequisites ###

This plugin bundles `plantuml-jar-mit-1.2020.15` but must have the other prerequisites for a local PlantUML v1.2020.15
[installation][plantuml--installation]:

* [Java][java]
* [Graphviz][graphviz] (this is not optional as the plugin can't tell if you
  plan to only create sequence or activity (beta) diagrams)

## How to use ##

### with gatsby-transformer-remark ###

```javascript
// In your gatsby-config.js
plugins: [
  {
    resolve: `gatsby-transformer-remark`,
    options: {
      plugins: [
        {
          // its order in the `gatsby-transformer-remark` plugins list is important.
          // * before `gatsby-remark-prismjs` so the code block has been transformed
          //   and `gatsby-remark-prismjs` will never see it as a code block
          // * after `gatsby-remark-code-titles` so the title block will be generated
          resolve: `gatsby-remark-plantuml`,
        },
      ],
    },
  },
]
```

### with gatsby-plugin-mdx ###

**WARNING** When writing MDX your file is JSX + Markdown. This means that you need to be aware of https://reactjs.org/docs/dom-elements.html.

The way this plugin works is by transforming Markdown code fences with the language `plantuml` to HTML that contains the plantuml generated svg.

**BUT** the HTML svg is not supported by JSX, you need to use the JSX version of svg.

Please see:

* https://www.gatsbyjs.org/docs/glossary/jsx/
* https://github.com/mdx-js/mdx/issues/1197
* https://stackoverflow.com/questions/23402542/embedding-svg-into-reactjs
* https://github.com/temando/remark-graphviz/blob/master/src/index.js

Ideally this plugin would work with the Syntax Trees and the pipeline instead of replacing the node's value with HTML.

Pull Requests welcome.

The options `stripXmlNamespace` and `stripEmbeddedCopy` are an attempt to hack around this issue and are enabled by default.

```javascript
// In your gatsby-config.js
    {
      resolve: `gatsby-plugin-mdx`,
      options: {
        gatsbyRemarkPlugins: [
          {
            // NOTE: As this plugin replaces the `plantuml` code blocks with an svg
            // its order in the `gatsby-transformer-remark` plugins list is important.
            // * before `gatsby-remark-prismjs` so the code block has been transformed
            //   and `gatsby-remark-prismjs` will never see it as a code block
            // * after `gatsby-remark-code-titles` so the title block will be generated
            resolve: `gatsby-remark-plantuml`,
          },
        ],
      },
    },

```

## Options

| Name       | Default     | Description |
| ---------- | ----------- | ----------- |
| `attributes` | `undefined` | String of custom attributes that will be added to the generated svg element. See [Custom Attributes](#custom-attributes) |
| `maxWidth` | `undefined` | The `maxWidth` value to apply to the `width` attribute of the generated svg.<br /><br />When `undefined` the svg will default to the plantuml width and height which is the entire diagram.<br /><br />Otherwise set the `width` attribute of the svg to the provided value, use any valid values include `vh` and `%`s. Additionally sets the `height` attribute of the svg to `auto` to ensure the svg sizes correctly |
| `plantumljar` | use embedded jar | Path to an alternative PlantUML Jar file |
| `stripEmbeddedCopy` | `true` | PlantUML embeds a copy of the diagram text inside the generated svg. When this option is `true` this copy will be stripped out of the svg |
| `stripXmlNamespace` | `true` | Strip the XML namespaces from the generated svg. Useful to work around embedded MDX issue and they are not required for embedded html |
| `JAVA_OPTS`  | [] | Additional options to pass to java executable.<br/><br/>Will always include `DEFAULT_JAVA_OPTS = ["-Djava.awt.headless=true"]`
| `PLANTUML_OPTS` | [] | Additional options to pass as options to plantuml.<br/><br/>**WARNING** use at own risk. Passing an incompatible option will cause this plugin to stop working and probably with no reasonable error messages generated.<br/><br/>Will always include  `DEFAULT_PLANTUML_OPTS=["-charset", "UTF-8", "-Dfile.encoding=utf8", "-pipe", "-pipeNoStderr", "-tsvg"]`

You can specify these options in your `gatsby-config.js` file as follows:

```javascript
// In your gatsby-config.js
plugins: [
  {
    resolve: `gatsby-transformer-remark`,
    // or resolve: `gatsby-plugin-mdx`,
    options: {
      plugins: [
        {
            resolve: 'gatsby-remark-plantuml',
            options: {
              maxWidth: '960',
              attributes: 'max-width: 960;',
              plantumljar: '/path/to/plantuml.jar'
            }
        },
      ],
    },
  },
]
```

### Usage in Markdown ###

See [PlantUML][plantuml] and select any of the diagram types from the top
navigation bar for examples of how to write PlantUML diagrams.

Then in a code block specify the language type of `plantuml` and in the code
block write your PlantUML diagram.

For example:

````
```plantuml
@startuml
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response

Alice -> Bob: Another authentication Request
Alice <-- Bob: Another authentication Response
@enduml
```
````

### Custom Attributes ###

You can use the code block meta values to pass custom attributes to the svg html tag.

By default, the following inline style is applied to all rendered SVGs in order to make them responsive:

```css
max-width: 100%;
height: auto;
```

This can be overwritten by using the custom attributes feature:

````
```plantuml style=""
@startuml
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response

Alice -> Bob: Another authentication Request
Alice <-- Bob: Another authentication Response
@enduml
```
````

#### Specifying css class ####
By including the css `class` value as a meta value to the plantuml codeblock any class can be attached to the generated svg tag.

````
```plantuml class="full-width"
````

**Note:** Your css stylesheets will need to define the class

## Known Problems ##

As part of https://github.com/mdx-js/mdx/issues/1197 it is possible that this remark plugin is not "doing the right thing".

Because the code block is replaced with `HTML` it appears that this is also processed by the markdown processors. This is noticeable when Markdown syntax like `**` is used within a PlantUML note, the test is marked as bold. Yet if you escape the syntax `\*\*` the backslashes now appear in the note.

The correct way is to be a propery citizen in the unified AST pipeline. But all the gatsby documentation/examples replace the current node with a new node where the value is th `html` representation.

A pull request with the correct way to do this is welcome.


[graphviz]: http://plantuml.com/graphviz-dot
[java]: https://www.java.com/en/download/
[plantuml--installation]: http://plantuml.com/starting
[plantuml]: http://plantuml.com/
