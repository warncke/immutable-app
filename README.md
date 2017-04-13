# immutable-app

Immutable App provides a framework built on
[express](https://www.npmjs.com/package/express) for developing web
applications.

Immutable App is designed to integrate with
[immutable-core](https://www.npmjs.com/package/immutable-core)
modules and methods,
[immutable-core-model](https://www.npmjs.com/package/immutable-core-model)
[immutable-core-controller](https://www.npmjs.com/package/immutable-core-controller)
[immutable-app-auth](https://www.npmjs.com/package/immutable-app-auth)
[immutable-access-control](https://www.npmjs.com/package/immutable-access-control)
and other components of the immutable ecosystem to provide a robust,
scalable, and highly secure application development environment built on
immutable data models.

## Native async/await

Immutable App requires Node.js v7.6.0 or greater with native async/await
support.

## A simple Immutable App

    const ImmutableDatabaseMariaSQL = require('immutable-database-mariasql')
    const immutableApp = require('immutable-app')

    const database = new ImmutableDatabaseMariaSQL(...)

    var app = immutableApp('my-app')

    app.config({
        database: {
            default: database,
        }
    })

    app.start()

Immutable App is a "highly opinionated" framework in the sense that it comes
with all of the necessary components for building a web based application or
API fully integrated and ready to deploy.

## Apps and APIs

Immutable Apps built using Immutable Models and Controllers are designed to
serve both HTML web apps and RESTful APIs using the same controllers and for
the most part the same routes.

Immutable App will detect whether or not a JSON response is requested.

If the HTTP `Accept` header contains `json` or the `X-Requested-With` header is
set to `XMLHttpRequest` then JSON will be returned unless the `json` query
param is set to `0` or `false`.

Setting the `json` query param to `1` or `true` will also result in JSON being
returned.

Otherwise an HTML page will be returned.

Immutable App uses [handlebars](http://handlebarsjs.com/) templates to render
HTML pages.

## Conventions

Immutable App relies heavily on naming and directory structure conventions to
create routes and specify models and controllers.

While convention is used to sketch out the broad strokes of an App the details
of app behavior are largely configured through Model and Controller
specifications.

### Immutable App directory structure

    my-app
      |
      +-- app
      |     +-- foo
      |     |     +-- foo.controller.js
      |     |     +-- foo.model.js
            |
            +-- bar
            |     +-- bam.hbs
            |     +-- index.hbs
      |     |
      |     +-- index.hbs
      |     +-- index.authenticated.hbs
      |
      +-- assets
      |     +-- base.css
      |     +-- base.js
      |
      +-- helpers
      |     +-- my-helper.js
      |
      +-- layouts
      |     +-- main.hbs
      |
      +-- partials
      |     +-- head.hbs
      |
      +-- views
      |     +-- instance.hbs
      |
      +-- app.js

#### app

The files and folders in the app directory determine the routes that will be
created for the app.

Each model must be in its own directory and there can only be one model per
directory.

Models must be named with <Model_Name>.model.js such as `foo.model.js` for a
model named foo.

Model files must export either an ImmutableCoreModel or an object that can be
passed to new ImmutableCoreModel.

Controllers must be named like <Name>.controller.js but the name is not used
for anything.

Each controller file must export either an ImmutableCoreController or an object
that can be passed to new ImmutableCoreController.

Multiple controller files may exist in the same directory as long as they
export plain objects. These object will be merged together prior to calling
new ImmutableCoreController.

ImmutableCoreController creates default controllers for ImmutableCoreModels
so if a model exists controllers will automatically be created for it and any
controller file(s) will be used to override the default controller
configurations.

Template files must end with the `hbs` extension.

If a template file is not used by any controller then a default controller that
serves the template for `get` requests will be created.

Template files served by default controllers will be served under the path that
corresponds to their directory and name.

In this example `bam.hbs` would be served from `/bar/bam`.

Template files named `index` will be served from the `/` path. For instance:
`bar/index.hbs` would be served from `/bar/`.

Template files may contain a role name that follows and is separated from the
template name by a dot.

In this example `index.authenticated.hbs` would be served to logged in users on
the `/` path while `index.hbs` would be served to logged out users on the same
path.

Dots should not be used in template names except to specify role specific
templates.

#### assets

The assets directory is used for serving static files such as javascript and
css. The assets directory is mounted using `express.static`.

#### helpers

Files with a `.js` extension in the helpers directory will be required and used
to provide handlebars helper functions.

Each file must export an object that maps the name of the helper to the helper
function.

By default Immutable App loads
[handlebars-helpers](https://www.npmjs.com/package/handlebars-helpers).

Any helpers in the helpers directory will override handlebars-helpers with the
same name.

#### layouts

Layouts are templates that wrap route specific templates and are generally used
for common headers and footers that are shared between multiple pages.

Immutable App is configured to use `main.hbs` and the default layout.

Immutable App provides its own `main.hbs` layout but if a main.hbs file exists
in an app's layouts directory the app version will override the default
version.

A simple layout looks like:

    <!DOCTYPE html>

    <html>
        <body>
            {{{body}}}
        </body>
    </html>

`{{{body}}}` is replaced with the content from whatever template is being
rendered.

#### partials

Partials are template files that are included from other templates and
typically shared between templates.

Immutable App comes with several partials defined for rendering tables, forms,
and other common elements.

Like layouts any app local partials with the same file name will override the
default versions.

Partials can be used from templates like:

    {{> head}}

Here head is the filename relative to the partials directory without the .hbs
extension.

The `head` partial is included with Immutable App and it renders css link tags,
script, and style tags, and other common head elements.

#### views

The views directory can be used as an alternative or in addition to the app
directory for storing templates.

Immutable App uses the views directory to store templates such as `list` and
`instance` that are generic templates that can be used for any model.

If a template is specific to one model/controller it is probably better to
locate it in the app dir with the model/controller.

## Configuration

    var app = immutableApp('my-app')

    app.config({ ... })

The config method is to set both global and module configuration variables.

Each `immutableApp` is a module and an Immutable App can consist of one or more
modules with each module able to define its own directories, models,
controllers, routes, express middleware, etc.

### Global configuration

#### assets

    app.config({
        assets: {
            css: [
                {
                    href: '/assets/base.css',
                },
            ],
            js: [
                {
                    src: '/assets/base.js',
                },
            ],
            scripts: [
                'console.log("foobar!")',
            ],
            styles: [
                '* {font-family: arial}'
            ],
        }
    })

The assets configuration is used to specify `css` and `js` files that are
loaded with link and script tags as well as `scripts` and `styles` that are
javascript and css strings placed directly on the page in script and style
tags.

`css` assets can have `href`, `crossorigin` and `integrity` attributes.

`js` assets can have `src`, `integrity`, `crossorigin`, `async` and `defer`
attributes.

Immutable App uses [Font Awesome 4.7.0](http://fontawesome.io/icons/)
[Pure CSS 0.6.2](https://purecss.io/) and [jQuery 3.1.1](http://jquery.com/)
served by [jsDelivr](https://www.jsdelivr.com/) along with local css and js
by default.

#### database

    app.config({
        database: {
            default: defaultDb,
            foo: fooDb,
        }
    })

The database object is used to defined one or more database connetions that
will be used by models.

Database connections are keyed by the model name so in this example fooDb would
be used by a model named foo.

The `default` database will be used by any models that don't have their own
connection defined by name.

#### handlebars

    app.config({
        handlebars: {
            defaultLayout: 'main',
            ext: '.hbs',
            helpers: {},
        },
        handlebarsHelpers: true,
    })

This example shows the default handlebars configuration.

`defaultLayout` is the name of the layout file that will be used if a controller
does not specify another layout.

`ext` is the extension for template files.

`helpers` is an object with helper functions keyed by name.

The `handlebarsHelpers` boolean determines whether or not the
handlebars-helpers npm module should be loaded.

#### use (Express middleware)

    app.config({
        use: [
            function (req, res, next) {
                next()
            },
            ['foo', function () {}],
        ],
    })

The use array specifies a list of Express middlewares to load. Either arrays or
functions may be specified.

Multiple Immutable App modules can define their own middlewares and these will
be used in the order that the Immutable App modules were instantiated.

Custom middlewares are used after default middlewares such as express.static,
bodyParser, cookieParser, and morgan.

#### Miscellaneous configuration

    app.config({
        // exit on listen errors
        exit: true,
        // use tls (https)
        https: false,
        // enable logging
        log: true,
        // port to listen on
        port: 7777,
    })

### Module configuration

    app.config({
        dir: {
            assets: [],
            app: [],
            helpers: [],
            layouts: [],
            partials: [],
            views: [],
        },
    })

The `dir` object can be used to configure resource directories on a per module
basis. Each type of directory may have an array with one or more directories to
serve that resource type from.

When multiple modules are used directories will be checked in reverse order so
that the most recently instantiated module(s) will override modules that were
instantiated before.

In order for a resource from one module to override a resource from another
module it must have the same name and relative path from the module base
directory.

## Application architecture

Immutable App and the larger Immutable ecosystem are designed to facilitate the
creation of Apps and APIs that:

    * use immutable data
    * are modular
    * prefer convention over configuration
    * prefer configuration over code
    * are secure
    * are massively scalable
    * separate application logic from application framework
    * separate application logic from data persistence
    * allow SQL/NoSQL to be mixed transparently e.g. MySQL, ElasticSearch,
      and Redis are all used to provide different functionality for models
      and the data persistence layer uses a single schema and a single set
      of access control rules to provide security and data validation no
      matter which data store is used.
    * provide a single location to define data schemas and validation rules
      that are applied both in the browser and on the server

### Immutable data

The use of Immutable data has several critical advantages:

    * Not allowing updates/deletes eliminates a large category of security
      risks. Allows data stores to be much more secure against internal risks
      because very few people need access to update/delete privileges.
    * Data integrity is easier to maitain without updates and deletes. The need
      for foreign key constraints which kill performance and prevent horizontal
      scaling is elminated.
    * The identification and collection of data for analytics does not need to
      be a separate task because all data is stored. Storing everything removes
      the problem of not knowing in advance what information will prove to be
      valuable in the future.
    * Audit logs, edit histories, scheduled data changes, and rollbacks are
      standard features of every model as opposed to complex additional
      features that must be designed for mutable data models on a one-off
      basis.
    * Because data records cannot be changed cached objects never have to be
      invalidated. This allows for efficient and accurate caching of data.

The paper and presentation
[Immutability Changes Everything](http://cidrdb.org/cidr2015/Papers/CIDR15_Paper16.pdf)
by Pat Helland provides an excellent summary of the benefits of Immutable data
from one of the most acclaimed engineers in the world.

Mr. Helland says that "Google, Amazon, Facebook, Yahoo, Microsoft, and more
keep petabytes and exabytes of immutable data!"

If Immutable data is the "secret sauce" that powers the largest companies in
the industry and someone with the reputation of Pat Helland swears by it that
should be a powerful motivation to leverage Immutable data in your own apps.

### Modular architecture

Immutable Apps are designed to be modular and immutable app modules can
correspond 1-to-1 with npm modules so that using an Immutable App module in
your app is as easy as doing a `require(...)` on that module.

Each module can define its own routes, models, controllers, and middlewares.

Models defined in one module are accessible from any other module loaded in
the same app.

Models and Controllers are built on top of Immutable Core which allows for
binding methods to run before or after other methods providing a mechanism
by which modules can be customized and extended by apps that include them.

Immutable Core also provides highly sophisticated tracing, debugging,
diagnostic and testing tools that help with the inevitable complexity that
develops in large modular applications.

### Convention and Configuration over Code

With Immutable App it is possible to create the majority of the functionality
for even large and complex applications without writing any code at all.

Immtuable App provides standard UX elements for dealing with CRUD operations
along with a role based access control system that allows for creating
multi-user and multi-tenant data management systems.

A single
[JSON Schema](https://spacetelescope.github.io/understanding-json-schema/index.html)
specification is used to generate an SQL schema, validate data on the server,
generate forms and validate data in the browser, all entirely through
configuration.

### Security

While using Immutable data and restricting access to update and delete
privileges on the database makes the entire system more secure Immutable Apps
also utilize Immutable Access Control to provide fine grained control over
access to resources.

Immutable Access Control is fully integrated with Immutable Models and
Immutable App Auth so that what data can be accessed and what data operations
can be performed will always be determined by the access control system.

With Immutable App there is never a need to do ad-hoc access control or data
filtering.

All Immutable Core Model data has record level ownership by default along with
tracing of what session and account created each record.

Immutable Access Control works the same no matter what data store is used so
the same access control rules will be applied whether the query is against
MySQL, ElasticSearch, or Redis.

For less secure and less reliable system like Redis and ElasticSearch
cryptographic hashing can be used to verify the integrity of data stored in
those systems.

### Immutable App Auth

    const immutableApp = require('immutable-app')`
    const immutableAppAuth = require('immutable-app-auth')

    immutableAppAuth.config({
        device: {
            cookie: {
                domain: '.your-app.com',
            },
        },
        facebook: { ... },
        google: { ... },
        session: {
            cookie: {
                domain: '.your-app.com',
            },
        },
    })

    immutableApp.config({ ... })

Immutable App Auth is an Immutable App module that provides authenticated
sessions for Immutable Apps and provides the foudation for using Immutable
Access Control to manage the security of an Immutable App.

Immutable App Auth supports Facebook and Google as auth providers and using
these integrations is a simple matter of putting in the client id and secret
for each provider.

When using Immutable App modules it is critical to `require('immutable-app')`
in your app.js before requiring any modules.

### Immutable App components

    * Express Application Server
    * Immutable App Auth
    * Immutable App Presenter
        * Immutable Access Control
        * Immutable App HTTP Error
        * Immutable App HTTP Redirect
    * Immutable Core Controller
        * Immutable Core
        * Immutable App HTTP Error
        * Immutable App HTTP Redirect
        * Immutable HTTP Client
    * Immutable Core Model Form
    * Immutable Core Model View
    * Immutable Core Model
        * Immutable Access Control
        * Immutable Core

#### Immutable App Auth

An Immutable App is composed of several modular components that all work
together to serve a request.

When a request is recieved by Express Immutable App Auth is the first component
to handle the request.

Immutable App Auth reads session and device cookies from the request to track
activity by device and determine if the request is being made by an established
session.

If the session is logged in then Immutable App Auth will load the roles that
are assigned to the session's account which will determine what resources the
session is allowed to access.

If the requested method and path are a valid route then the Immutable App
Presenter handler function will be called.

#### Immutable App Presenter

Immutable App Presenter provides an itermediary layer between the Express
request and the Immutable Core Controller.

The Presenter will first use Immutable Access Control to check if the current
session is allowed to access the requested path with the requested http method.

The Presenter will then determine based on what roles the session has which
controller and template to use to handle the request.

The Presenter also performs validation and normalization of input data.

The Immutable Core Controller must specify what input it requires and where to
get it from e.g. req.params.foo, req.body.bar, req.headers.bam, etc.

Once the Presenter has built and validated the input data it calls the
Controller with the input.

The Controller should resolve with data that can be used as a JSON response
or as variables for rendering a template depending on what the client has
requested. The response data can also include headers and cookies to send to
the client.

If the Controller throws an error the Presenter may use this to render an
error page in the case of an Immutable App HTTP Error or to perform a redirect
in the case of Immutable App HTTP Redirect.

Errors and Redirects will also be returned as JSON if the client has requested
it.

#### Immutable Core Controller

With the Presenter acting as an intermediary for all interactions with Express
the Controller is abstracted away from the details of HTTP request handling.

Controllers can be entirely custom but Immutable Core Controller also provides
default controllers to handle all of the actions performed by models.

All controllers are implemented on top of Immutable Core which means that they
are Promise based and can utilize before and after methods in addition to their
primary method.

For default model controllers all of the data loading and action typically takes
place in the `before` method of the controller and then the main method does any
work that is needed to prepare the data for the response.

These default controller methods can be overrident by custom code or additional
`before` and `after` methods can be added to extend their functionality.

In typical scenarios the Controller will use one or more Immutable Core Models
to manipulate data and possibly use Immutable HTTP Client to make an API
request to another service.

The Controller may also use Immutable App HTTP Error or HTTP Redirect to abort
processing and return either an error or redirect to the client.

#### Immutable Core Model

When a Controller attempts to perform any action on an Immutable Core Model
Immutable Access Control will check to see if the current session is allowed to
perform that action.

If access is denied an Immutable App HTTP Error will be thrown.

When a Controller is creating or modifying a record Immutable Core Model Form
will typically be used to generate a form that can be used to manipulate the
model. This form can be entirely based based on the Model's JSON schema or may
include additional configurable customizations.

When a Controller is listing or reading records Immutable Core Model View may
be used to aggregate and/or format record data for display.

Immutable Core Model View classes can be generic, such as converting datetime
fields on a record to a session's local time, or they may be sepcific to a
particular model class.

Multiple Immutable Core Model Views can be applied to the same record at the
same time so formatting models through the composition of single purpose
generic Model View components is encouraged.

#### Immutable Core

Immutable Core Models use Immutable Core methods to perform their underlying
create and query methods.

This means that technically is is possible to place Immutable Access Control
rules on these underlying Immutable Core method calls as well but since
Immutable Core Model has its own much finer grained access controls this should
usually not be used.

Like Immutable Core Controllers it can be useful to bind extension methods
`before` and `after` Immutable Core Model create and query methods to extend
models with additional customized functionality.

### Immutable Core Model app lifecycle

By default Immutable App loads all model files in an app and in its modules
and then when the app is started it goes through and assigns database
connections to each model based on the database config for the app and then
calls the `sync` method for each model to validate that the schema in the
database matches the specification of the model.

This default behavior is good for development on a local machine but it will
not work in production where individual application servers should not have
permission to alter schemas.

In order to deploy model changes in production a two step approach should be
taken.

#### Sync models with database on secure admin node

Using a priviledged database account on a secure admin node the app should be
started with the START_TEST_ONLY env variable set like:

    START_TEST_ONLY=1 node app.js

With this option set application configuration will be validated and all models
will be sync'd with the database but then instead of starting the app will exit.

#### Disable sync on app nodes

With the sync handled prior to deployment on a secure admin node sync on app
nodes should be disabled by setting the NO_SYNC env variable like:

    NO_SYNC=1 node app.js