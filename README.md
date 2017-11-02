# JS Functional Testing (aka `enzyme-fetch-mock`)

Powered by [jest][jest], [enzyme][enzyme] and [fetch-mock][fetch-mock]

![enzyme](https://cdn-images-1.medium.com/max/1600/1*pu9U8EYL3KGrgvapyp1pSg.png)

Eventbrite's functional testing framework is a set of tools and guidelines that allow behavioral testing at the App componenet level. At a high level it can be boiled down to 4 simple steps.

  - Render the entire app
  - Mock api calls responses to simulate server interaction
  - Move through the app using UI interaction (click, add input value, etc) of HTML elements
  - Make assertions about HTML elements in the app when the component is done rerendering

Run the following command to set a watcher to run tests that have been affected by your file changes:
```sh
yarn test:unit:watch
```

To run a specific test file, you can pass the file name (you don't need the extension):
```sh
# Filename.unit.spec.js
yarn test:unit:watch Filename
```

To run all tests, run
```sh
yarn test:unit
```

# Table of Contents
1. [Outline](#outline)
    - [Why JS Functional Testing?](#why-js-functional-testing)
    - [Project Requirements](#project-requirements)
    - [JS Functional Testing In Summary](#js-functional-testing-in-summary)
    - [Technology](#technology)
2. [Getting Started](#getting-started)
   - [Render the App](#render-the-app)
   - [Configure the fetch-mock Instance](#configure-the-fetch-mock-instance)
   - [UI Interaction](#interact-with-the-ui-of-the-app)
   - [Make Assertions About the App](#make-assertions-about-the-app)
   - [Example](#full-example)
   - [Philosophy](#philosophy)
3. [EnzymeFetchMock API Documentation](#enzymefetchmock-api-documentation)
   - [Constructor](#constructor)
   - [Wrapper (UI) Interaction API](#wrapper-interaction)
     - [.changeValue(selector, value, [focus=false, blur=false]) => null](#changeValue)
     - [.find(selector) => ReactWrapper](#find)
     - [.click(selector) => null](#click)
   - [Wait API](#wait-api)
     - [.pollFor(predicate, [timeout=500(ms)]) => Promise](#pollFor)
     - [.waitFor(selector, [timeout=500(ms)]) => Promise](#waitFor)
     - [.waitForApiCall(apiEndpoint, method) => Promise](#waitForApiCall)
     - [.sleep([timeout=1000(ms)]) => Promise](#sleep)
   - [Utilities](#utilities)
     - [.getApiCalls(apiEndpoint, method) => [{url, params}, ...]](#getApiCalls)


## Outline

### Why JS Functional Testing?

Back in the days of Marionette and jasmine, our components were wrapped in a Marionette [Layout](https://marionettejs.com/docs/v1.8.8/marionette.layout.html) view. Since these layouts often pulled in pieces of code from all different parts of our codebase, the unit tests for layouts functioned almost like integration tests to ensure the composition of components built and ran together correctly. They worked... but they came with issues, specifically they often polluted the global testing area (browser and dom) and they ran really slowly.

In 2017, we built out the bulk of our react code base and with that move, coverage for these unit-integration pieces was lost. We have UI testing for our pages with selenium and webdriver, which don't run on code diffs and are often flakey, and we have unit tests with jasmine and react-test-utils (soon to be jest and enzyme) but nothing in between to capture component integration.

Here's an example of a problem that arose:
On our event creation page, we have a text input to enter in an event name. When a character is entered into this text field, a bar appears across the foot of the page displaying a "submit" button to submit the event information. When a component was updated in our separate design system library that broke this functionality, the unit tests for both the create page and the design system passed, but because their interaction was not captured in a test, the page broke in production.

[back to the top](#table-of-contents)


### Project Requirements
A group was set to investigate the problem and came up with some requirements.

:white_check_mark: The new testing framework must:
  - be javascript based
  - be faster (able to run on diffs) and more stable than selenium/webdriver
  - be able to catch interaction errors between different libraries or components
  - be easy to write and debug
  - use popular/community supported products

:no_entry: The new testing framwork should not:
  - run a server that serves pages to test against
  - test for visual difference in css style (spacing, color, etc)
  - hit real api's (not a full integration or end to end test)

[back to the top](#table-of-contents)


### JS Functional Testing In Summary
A react app is [fully mounted][enzyme-rendering] using `enzyme`'s mount utility. A `fetch-mock` instance is created to mock all requests that the app will make. The mounted component and the `fetch-mock` instance are passed to Eventbrite's `enzyme-fetch-mock` library which returns a set of helper tools. These tools can be used to interact with the UI of the App and to wait for the component to render itself after changes to it's internal state. Once the App is rerendered to the desired state, assertions can be made about the component. It's that simple!

[back to the top](#table-of-contents)


### Technology
* [enzyme](enzyme) -  Utility for React that makes it easier to assert, manipulate, and traverse your React Components' output.
* [fetch-mock](fetch-mock) - Mock http requests made using fetch
* [jest](jest) - Delightful Javascript testing framework

[back to the top](#table-of-contents)


## Getting Started
Using the JS Functional Testing framework can be broken down into 4 processes.
  - Render the entire app
  - Mock api calls responses to simulate server interaction
  - Move through the app using UI interaction (click, add input value, etc) of HTML elements
  - Make assertions about HTML elements in the app when the component is done rerendering

Let's take a look at these four stages in depth.

[back to the top](#table-of-contents)


### Render the App
First the App to test is rendered using enzyme's [mount][mount] utility. The neat part about `mount` is that it ensures the component's full lifecycle methods are run.
```js
import App from './App';
import {mount} from 'enzyme';

...
const component = mount(<App env={ENV} request={REQUEST} user={USER} />);
```

But what about props like env or footerLinks? What a nightmare to mock!

Take a look inside `src/common/__fixtures__/props` and see if the prop you need has already been mocked out! If you don't find your prop but you believe it has the potential to be needed by other apps, consider adding your mock here for the next developer to use.

[back to the top](#table-of-contents)


### Configure the fetch-mock instance
Create a [fetch-mock][fetch-mock] instance that mocks out all fetch requests that the app makes. `fetch-mock` will throw an error if any requests escape the tests without being mocked. This may sound daunting, but this can actually be useful, because requested endpoints will be logged to the console. These API endpoints can the be called against a real server in QA and often a copy-paste of the response is enough to get going.
```js
import fetchMock from 'fetch-mock';
import {EVENTS_RESPONSE, USER_RESPONSE} from './__fixtures__/fetch_mock_responses';

...
fetchMock
    .get('/api/events', EVENTS_RESPONSE)
    .post('/api/users/123', USER_RESPONSE);
```
Any time fetch is called with a matching endpoint, the corresponding response will be returned. Neat!

:star: Here's an example of a quick way to create mock responses.

In the test file, mount an app that makes an API call, and create your `enzyme-fetch-mock` instance:
```js
it('makes an API call', async () => {
    const component = mount(<App/>);
    const enzymeFetchMock = new EnzymeFetchMock(fetchMock, component);
```

Run the test and check the console output, it should look something like this.
```sh
root@a65521b52508:/srv/core/js# yarn test:unit:watch App
yarn test:unit v0.24.6
$ jest --config=config/jest.json App
 FAIL  src/App.unit.spec.js
  app functional tests
    ✕ should make an api call (288ms)

  ● app functional tests › should make an api call

    fetchMock object failed to mock API request: /directory/autocomplete/?q=foo&loc=Current%20Location (GET)
```

`fetch-mock` has printed the offending api call to the console! Take the endpoint and run it against a real (QA) server. In this case it would be something like `http://evbqa.com/directory/autocomplete/?q=foo&loc=Current%20Location`. Create a file in your app's `__fixtures__` direcotry called `fetch_mock_responses.js`

```js
// path/to/__fixtures__/fetch_mock_responses.js

export const LOCATION_API_RESPONSE = () => ({
    // api response
})
```

Configure it on your `fetch-mock` instance as was demonstrated above! Easy!


> In the future, [fetch-vcr][fetch-vcr] might be a good way to make this process even easier!

[back to the top](#table-of-contents)


### Interact with the UI of the App

Now that we have our component mounted and set to fetch our desired api responses, we can begin the user simulated interactions. Eventbrite's `enzyme-fetch-mock` is a library that was designed to make this process as easy as possible. Create an instance of `enzyme-fetch-mock` by passing the `fetch-mock` instance and the mounted app component to it.

```js
import App from './App';
import EnzymeFetchMock from 'path/to/enzyme-fetch-mock';
import {mount} from 'enzyme';
import fetchMock from 'fetch-mock';

//...

it('renders properly', () => async {
    const component = mount(<App />);
    const enzymeFetchMock = new EnzymeFetchMock(fetchMock, component);
});
```

EnzymeFetchMock is designed to assist with two things:
1) Interact with the HTML elements of the app
2) Faciliate `await`-ing for the component to rerender

Here are some example interactions using an instance of enzyme-fetch-mock:

```js
// clicks submit button
enzymeFetchMock.click('[data-spec="submit-button"]');
// enters text into the text input field
enzymeFetchMock.changeValue('[data-spec="text-input"]', "event name");
```

After interacting with an HTML element, it's common to need to wait for the UI to update in order to make assertions about the app. Since all promises are asynchronous by nature, it can be cumbersome to try and manage setting timeouts or other async management tactics. `EnzymeFetchMock` can be used to make this easier.

```js
enzymeFetchMock.click('[data-spec="submit-button"]');
await enzymeFetchMock.waitForApiCall('/api/events?123', 'GET');
// app has now processed the api response
```

> NOTE: All user interactions must occurr against HTML element. User interaction helpers like `.click()` only accept CSS selectors.

[back to the top](#table-of-contents)


### Make assertions about the app
Once the app is done rerendering, it is trivial to make assertions using jest's `expect`.
```js
enzymeFetchMock.click('[data-spec="submit-button"]');
await enzymeFetchMock.waitForApiCall('/api/events?123', 'GET');

expect(enzymeFetchMock.find('[data-spec="list-item"]')).toHaveLength(5);
```

> NOTE: All assertions must occurr against HTML element. `.find()` only accepts CSS selectors.

[back to the top](#table-of-contents)


### Full example
Let's take a look at an example that follows a common user flow. A user will fill out a text input field in a form and click the submit button. The component should then make an api call and rerender accordingly.
```js
import React from 'react';
import App from './App';
import {mount} from 'enzyme';
import fetchMock from 'fetch-mock';
import EnzymeFetchMock from 'path/to/enzyme-fetch-mock';
import {EVENTS_RESPONSE} from './__mocks__/fetch';

it('should find populate the event list', async () => {
    fetchMock.get('/api/events', EVENTS_RESPONSE);
    const component = mount(<App />);
    const enzymeFetchMock = new EnzymeFetchMock(fetchMock, component);

    enzymeFetchMock.changeValue('[data-spec="search-input"]', 'test event');
    enzymeFetchMock.click('[data-spec="submit-search"]');

    await enzymeFetchMock.waitForApiCall('/api/events', 'GET');
    expect(enzymeFetchMock.find('[data-spec="list-item"]')).toHaveLength(5);
});
```

You could even move the ```waitForApiCall(...)``` into the execept block. If you'd like to ensure that api is called.

```js
expect(await enzymeFetchMock.waitForApiCall('/api/events', 'GET'));
expect(enzymeFetchMock.find('[data-spec="list-item"]')).toHaveLength(5);
```

[back to the top](#table-of-contents)


### Philosophy

Spinning up an entire app and fully mounting it is often an expensive operation. It is recommended that this testing framework be used only for very important user flows or things that are too complex to test with our other testing frameworks. Remember, our goal is to catch interaction errors between components in high traffic areas. Leave simple assertions about contained component state to unit testing.

Examples of good use cases for these types of tests are something like the waiting room, where it is complex to spin up the servers needed to simulate a high demand onsale, or the create flow which is generally linear and integral to the Eventbrite product.

[back to the top](#table-of-contents)


## EnzymeFetchMock API Documentation
Check out the source on [github][enzyme-fetch-mock].

### Constructor

#### `new EnzymeFetchMock(fetchMock, reactWrapper, [waitTimeout=500]) => enzymeFetchMock`

> NOTE: Make sure to create the instance of EnzymeFetchMock with the `new` keyword
##### arguments
1) `fetchMock: object` - an instance of a [fetch-mock](fetch-mock) object
2) `ReactWrapper: object` - a react app wrapped in an [enzyme wrapper](mount)
3) `waitTimout: number` - the default maximum time in milliseconds to wait before timing out (optional, default 500ms)

##### returns
``` EnzymeFetchMock instance ```

##### example
```js
const enzymeFetchMock = new EnzymeFetchMock(fetchMock, component);
```

[back to the top](#table-of-contents)

-----

<a name="wrapper-interaction"></a>
### Wrapper Interaction API

<a name="changeValue"></a>
#### `.changeValue(selector, value, [focus=false, blur=false]) => undefined`

Change the value attribute of the element found at the passed selector

##### arguments
1) `selector: string`: string CSS selector to identify target element
2) `value: string`: value to be set as the value attribute of the selected target
3) `focus: boolean`: focus element before change (optional, default false)
4) `blur: boolean`: should blur element after change (optional, default false)

##### returns
``` undefined ```

##### exmaple
```js
enzymeFetchMock.changeValue('[data-spec="search-input"]', 'test event', true);
```

[back to the top](#table-of-contents)

-----

<a name="find"></a>
#### `.find(selector) => ReactWrapper`

return enzyme ReactWrappers for all elements found at the passed selector

##### arguments
1) `selector: string`: string CSS selector to identify target element

##### returns
``` enzyme ReactWrapper ```

##### example
```js
enzymeFetchMock.find('[data-spec="events-container"]');
```

[back to the top](#table-of-contents)

-----

<a name="click"></a>
#### `.click(selector) => undefined`

Click on the element found at the passed selector

##### arguments
1) `selector: string`: string CSS selector to identify target element

##### returns
``` undefined ```

##### example
```js
// click on any component with a data-spec attribute 'submit-button'
enzymeFetchMock.click('[data-spec="submit-button"]');

```
> NOTE: `.click()` currently does not simulate `mouseenter` and `mouseexit` before and after the click event

[back to the top](#table-of-contents)

-----


### Wait API

<a name="waitFor"></a>

#### `.waitFor(selector, [timeout=500]) => Promise`

Wait for selector to be found in the rendered component, then resolve awaited `Promise`

##### arguments
1) `selector: string`: string CSS selector to identify target element

##### returns
``` Promise ```

##### example
```js
// poll component until css selector appears
await enzymeFetchMock.waitFor('.red-banner');
// .red-banner element was rendered
```

[back to the top](#table-of-contents)

-----

<a name="waitForApiCall"></a>
#### `.waitForApiCall(apiEndpoint, [method]) => Promise`

Wait for a response from the requested endpoint to resolve

##### arguments
1) `apiEndpoint: string|Rexexp`: API endpoint string or Regexp
2) `method: string`: HTTP request method type to match against (optional, matchces against all method types)

##### response
``` Promise ```

##### example
```js
await enzymeFetchMock.waitForApiCall('/api/users/123', 'GET');
// api call has returned
```

[back to the top](#table-of-contents)

-----

<a name="pollFor"></a>

#### `.pollFor(predicate, [timeout=500]) => Promise`

Execute the passed predicate until it returns `true`, then resolve awaited `Promise`

##### arguments
1) `predicate: function`: when predicate returns `true`, awaited `Promise` will resolve
2) `timout: number`: time in milliseconds before `pollFor` exits polling (optional, default `500`)

##### returns
``` Promise ```

##### example
```js
// test predicate and return promise when predicate is true
await enzymeFetchMock.pollFor(() => localStorage.get('item') === 'update'));
```

[back to the top](#table-of-contents)

---

<a name="sleep"></a>

#### `.sleep([timeout=1000(ms)]) => Promise`

> NOTE: FOR DEVELOPMENT ONLY!!

`setTimeout` wrapped in Promise for debugging purposes

##### arguments
1) `timeout: number`: sleep time in milliseconds until awaited `Promise`` is resolved (optional, default 1000ms)

##### response
``` Promise ```

##### example
```js
// see what component looks like after 3 seconds
await enzymeFetchMock.sleep(3000);
console.log(component.html());
```

[back to the top](#table-of-contents)

---

### Utilities

<a name="getApiCalls"></a>
#### `.getApiCalls(apiEndpoint, [method]) => [{url, params},...]`

Get a list of all API calls that have been made at the given endpoint and (optional) HTTP method

##### arguments
1) `apiEndpoint: string|Regex`: matching API endpoint string or Regex
2) `method: string`: HTTP request method type (optional, matchces against all method types)

##### response
```js
[
    {
        url[string]: url string,
        params[object]: request data,
    },
    ...
],
```

##### example
```js
const userApiCalls = enzymeFetchMock.getApiCalls('/api/users/123', 'GET');
expect(userApiCalls[0].params.userName).toEqual('Kaylie');
```

[back to the top](#table-of-contents)


[enzyme]: http://airbnb.io/enzyme/
[enzyme-rendering]: http://airbnb.io/enzyme/docs/api/
[fetch-mock]: http://www.wheresrhys.co.uk/fetch-mock/api
[jest]: https://facebook.github.io/jest/
[mount]: http://airbnb.io/enzyme/docs/api/ReactWrapper/mount.html
[fetch-vcr]: https://www.npmjs.com/package/fetch-vcr
[enzyme-fetch-mock]: https://github.com/eventbrite/core/blob/master/js/testUtils/enzyme-fetch-mock.js
