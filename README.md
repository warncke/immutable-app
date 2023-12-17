# immutable-app

Immutable App provides a framework for developing web applications and APIs
built on immutable data.

The Immutable App ecosystem includes several other modules that will typically
be used together including:

* [Immutable Core](https://www.npmjs.com/package/immutable-core)
* [Immutable Core Controller](https://www.npmjs.com/package/immutable-core-controller)
* [Immutable Core Model](https://www.npmjs.com/package/immutable-core-model)
* [Immutable Core Model View](https://www.npmjs.com/package/immutable-core-model-view)
* [Immutable Core Service](https://www.npmjs.com/package/immutable-core-service)
* [Immutable Access Control](https://www.npmjs.com/package/immutable-access-control)

## Immutable App v0.17

Immutable App v0.17 removes support for server side rendering and focuses
exclusively on providing APIs.

!!! Immutable APP DOES NOT CURRENTLY PERFORM ANY ACCESS CONTROL ON REQUESTS !!!

Immutable App Auth relied on server side rendering to work and so it was
removed. It will be redone at a later time when the front-end dev stack is
complete.

## A simple Immutable App

    const ImmutableCoreModel = require('immutable-core-model')
    const immutableApp = require('immutable-app')

    const mysql = await ImmutableCoreModel.createMysqlConnection(connectionParams)

    var app = immutableApp('my-app')

    app.config({
        mysql: {
            default: mysql,
        }
    })

    await app.start()

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
      |     |
      |
      |
      +-- services
      |     +-- foo.service.js
      |
      |
      +-- app.js

#### app

The files and folders in the app directory determine the routes that will be
created for the app.

Files can be either controllers or models.

##### Controllers

Controllers must be named like <controller-name>.controller.js but the name is
not used for anything.

Each controller file must export a plain object that can be passed to
`new ImmutableCoreController`.

ImmutableCoreController creates default controllers for ImmutableCoreModels
so if a model exists controllers will automatically be created for it and any
controller file(s) will be used to override the default controller
configurations.

##### Models

Each model must be in its own directory and there can only be one model per
directory.

Models must be named with <Model_Name>.model.js such as `foo.model.js` for a
model named foo.

Model files must export a plain object that can be passed to
`new ImmutableCoreModel`.

##### Extending controllers and models

Immutable App is designed to be modular so controllers and models defined in
modules can be extended by other modules or in an app.

To extend an existing controller or model the controller or model must be in
the same relative dir position.

Controller and model specifications defined for the same relative directory in
the app will be merged together in the order that module(s) are required in
the app.

#### services

The services directory can contain one or more
[Immutable Core Services](https://www.npmjs.com/package/immutable-core-service).

Each service must be named like <Service_Name>.service.js sub as
`foo.service.js` for a service named `foo`.

Service files must export a plain object that can be passed to
`new ImmutableCoreService`.

Like controllers and models, services defined in one module can be extended
and overriden by services with the same name defined in other modules or in the
main application.

All Immutable Core Services will be initialized prior to the app starting. This
includes any services that are defined outside of the services directory and
required directly elsewhere.

## Configuration

    var app = immutableApp('my-app')

    app.config({ ... })

The config method is used to set both global and module configuration variables.

Each `immutableApp` is a module and an Immutable App can consist of one or more
modules with each module able to define its own directories, models,
controllers, routes, express middleware, etc.

### Global configuration

#### mysql

    app.config({
        mysql: {
            default: defaultDb,
            foo: fooDb,
        }
    })

The `mysql` object is used to define one or more database connections that
will be used by models.

Database connections are keyed by the model name so in this example fooDb would
be used by a model named foo.

The `default` database will be used by any models that don't have their own
connection defined by name.

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
            app: [],
            services: [],
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
  risks. Allows data stores to be more secure against internal risks
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

!!! Immutable APP DOES NOT CURRENTLY PERFORM ANY ACCESS CONTROL ON REQUESTS !!!

### Immutable App components

* Express Application Server
* Immutable App Presenter
  * Immutable Access Control
* Immutable Core Controller
  * Immutable Core
  * Immutable HTTP Client
* Immutable Core Model Form
* Immutable Core Model View
* Immutable Core Model
  * Immutable Access Control
  * Immutable Core
* Immutable Core Service
  * Immutable Core Model

#### Immutable App Presenter

Immutable App Presenter provides an itermediary layer between the Express
request and the Immutable Core Controller.

The Presenter will first use Immutable Access Control to check if the current
session is allowed to access the requested path with the requested http method.

The Presenter also performs validation and normalization of input data.

The Immutable Core Controller must specify what input it requires and where to
get it from e.g. req.params.foo, req.body.bar, req.headers.bam, etc.

Once the Presenter has built and validated the input data it calls the
Controller with the input.

The Controller should resolve with data that can be used as a JSON response.
The response data can also include headers to send to the client.

Errors and Redirects will also be returned as JSON.

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

When a Controller is listing or reading records Immutable Core Model View may
be used to aggregate and/or format record data for display.

Immutable Core Model View classes can be generic, such as converting datetime
fields on a record to a session's local time, or they may be sepcific to a
particular model class.

Multiple Immutable Core Model Views can be applied to the same record at the
same time so formatting models through the composition of single purpose
generic Model View components is encouraged.

#### Immutable Core Service

Immutable Core Services provide a mechanism to initialize and periodically
reinitialize shared global data.

All registered services are initialized prior to the app starting so the
data that the service maintains will always be available when the app is
running.

#### Immutable Core

Immutable Core Models use Immutable Core methods to perform their underlying
create and query methods.

This means that technically is is possible to place Immutable Access Control
rules on these underlying Immutable Core method calls as well but since
Immutable Core Model has its own much finer grained access controls this should
usually not be used.

Like Immutable Core Controllers it can be useful to bind extension methods
`before` and `after` to Immutable Core Model create and query methods to extend
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