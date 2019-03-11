const POLL_INTERVAL = 50;
const DEFAULT_WAIT_TIMEOUT = 500;

const isFunction = (object) => typeof object === 'function';
const isObject = (object) => typeof object === 'object';

export const DATA_SPEC_ATTRIBUTE_NAME = 'data-spec';

/**
* Finds all instances of components in the rendered `componentWrapper` that are DOM components
* with the `data-spec` attribute matching `name`.
* @param {ReactWrapper} componentWrapper            Rendered componentWrapper (result of mount, shallow, or render)
* @param {string} specName                          Name of `data-spec` attribute value to find
* @param {string|Function} [typeFilter]             Expected type of the wrappers (defaults to all HTML tags)
* @returns {ReactComponent[]}                       All matching DOM components
*/
const getSpecWrapper = (componentWrapper, specName, typeFilter) => {
    let specWrappers;

    if (!typeFilter) {
        specWrappers = componentWrapper.find(`[${DATA_SPEC_ATTRIBUTE_NAME}="${specName}"]`);
    } else {
        specWrappers = componentWrapper.findWhere((wrapper) => (
            // Only call `prop` if a wrapper node exists
            wrapper.length &&
            wrapper.prop(DATA_SPEC_ATTRIBUTE_NAME) === specName && wrapper.type() === typeFilter
        ));
    }

    return specWrappers;
};

/**
 * Used to ensure a function is passed to wait functions expecting functions
 * @param  {function} predicate     argument will throw error if it's not a function
 */
const validatePredicate = (predicate) => {
    if (!isFunction(predicate)) {
        throw new Error('Predicate argument must be type function.');
    }
};

/**
 * Used to ensure methods aren't called that require the enyzme wrapped component to function
 * @param  {object} component enzyme wrapped component
 */
const validateComponent = (component) => {
    if (!isObject(component) || !isFunction(component.unmount)) {
        throw new Error('EnzymeFetchMock must be passed a mounted component on creation.');
    }
};

/**
 * Used to ensure methods aren't called that require the fetchMock object
 * @param  {object} fetchMock fetchMock object
 */
const validateFetchMock = (fetchMock) => {
    if (!isObject(fetchMock) || !isFunction(fetchMock.mock)) {
        throw new Error('EnzymeFetchMock must be passed a fetchMock object on creation');
    }

    if (!fetchMock.routes.some((route) => route.name === '*')) {
        // Add catch-all route matcher to the end of fetchMock object so we complain loudly
        // about the test being leaky and potentially making *real* API calls
        fetchMock
            .mock('*', (url, {method}) => {
                throw new Error(`fetchMock object failed to mock API request: ${url} (${method})`);
            });
    }

    // ensure wildcard mocks are the last ones evaluated to prevent
    // other mocks to be ignored
    fetchMock.routes.sort((a) => a.name === '*' ? 1 : -1);
};

/**
 * Used by waitFor to test the predicate truthiness. If predicate -> resolve()
 * Await pending promises to resolve.
 * await Promsise.all is crucial here, some api calls kick off other api calls.
 * Since we await, those initial promises have a chance to resolve and kick off the
 * following fetch calls.
 *
 * @param  {object} fetchMock       fetchMock object
 * @param  {function} predicate     when predicate returns true, awaited promise will resolve
 * @param  {function} resolve       callback, intended to be the resolve function of a Promise
 */
const checkPredicate = (fetchMock, predicate, resolve) => {
    Promise.all(fetchMock._holdingPromises)
        .then(() => {
            if (predicate()) {
                resolve(true);
            }
        });
};

/**
 * Inner workings of pollFor. Sets timeouts and calls itself until the passed
 * predicate returns true or a timeout occurs. See pollFor for more docs.
 *
 * @param  {function} predicate     function to call every poll interval to determine success/error
 * @param  {function} onSuccess     function to call when predicate returns true within timeout
 * @param  {function} callbacks     function to call when timeout expires
 * @param  {Number}   timeout       timeout in milliseconds
 */
const poll = (predicate, onSuccess, onError, timeout) => {
    const next = (currentTime = 0) => {
        if (predicate()) {
            onSuccess(true);
        } else if (currentTime > timeout) {
            onError(
                new Error(`Timeout polling for predicate. ${predicate} never returned true.`)
            );
        } else {
            setTimeout(next.bind(null, currentTime + POLL_INTERVAL), POLL_INTERVAL);
        }
    };

    next();
};

/**
 * Converts fetchMock calls from arrays to objects for clarity
 * @param  {array}  fetchMockCall call retrieved from fetchMock.calls()
 * @return {object}
 */
const translateMockCallToObject = ([url, params]) => ({url, params});


/**
 * Test class to find component elements, wait for component rendering and
 * find api call information. Uses a mounted enzyme component and the
 * fetch-mock library.
 */
export default class EnzymeFetchMock {

    /**
     * Sets basic fields on the class. Some methods will not be available if
     * constructor arguments are not passed.
     *
     * @param  {object} fetchMock fetchMock instance to be tested against
     *                  - http://www.wheresrhys.co.uk/fetch-mock/
     * @param  {object} mountedComponent enzyme wrapper
     *                  - http://airbnb.io/enzyme/docs/api/mount.html
     * @param  {object} options configuration options
     *                  - {Number} waitTimeout the default maximum time to wait before timing out
     */
    constructor(fetchMock, mountedComponent, {waitTimeout = DEFAULT_WAIT_TIMEOUT} = {}) {
        validateFetchMock(fetchMock);
        validateComponent(mountedComponent);


        this._component = mountedComponent;
        this._fetchMock = fetchMock;
        this._waitTimeout = waitTimeout;
    }

    /**
     * Enters text in an input element. More specifically, it updates the value
     * attribute of an element and triggers change. This enables this helper to work
     * on other elements that also depend on the 'value' attribute (like select dropdowns).
     * ex. changeValue('.select-box', 'second-option');
     *
     * @param  {string} selector     css selector to search for
     * @param  {string} value           value to set on the selected element
     * @param  {boolean} foocus         should focus element before change
     * @param  {boolean} blur           should blur element after change
     */
    changeValue(selector, value, focus = false, blur = false) {
        const input = this.find(selector);

        if (focus) {
            input.simulate('focus');
        }

        input.simulate('change', {target: {value}});

        if (blur) {
            input.simulate('keyDown', {
                which: 27,
                target: {
                    blur() {
                        input.simulate('blur');
                    },
                },
            });
        }
    }

    /**
     * Triggers click on the element found indicated by the passed selector
     * ex. click('.button-one');
     *
     * @param  {string} selector     selector to search for on react component
     */
    click(selector) {
        // TODO: We may need to simulate `mouseover`/`mouseenter` prior to clicking
        this.find(selector).simulate('click');
    }

    /**
     * Triggers submit on the element found indicated by the passed selector
     * ex. submit('.form-submit');
     *
     * @param  {string} selector     selector to search for on react component
     */
    submit(selector) {
        this.find(selector).simulate('submit');
    }

    /**
     * Searches the react component for the passed selector, then returns the
     * enzyme ReactWrapper if found.
     * ex. find(MyComponent);
     *
     * @param  {string} selector css selector to search for
     * @return {object}          enzyme ReactWrapper
     */
    find(selector) {
        if (typeof selector !== 'string') {
            throw new Error('Only string CSS selectors are supported in order to ensure HTML element selection only.');
        }

        // only return matching HTML nodes, exclude matching components
        return this._component.find(selector).filterWhere((node) => typeof node.type() === 'string');
    }

    /**
     * Searches the react component for the passed specId, then returns the
     * enzyme ReactWrapper if found.
     * ex. find(MyComponent);
     *
     * @param  {string} specId specId to search for
     * @param  {string} parent element in which to apply the search, if different from current wrapped element
     * @param  {string} typeFilter element type filter to apply
     * @return {object}          enzyme ReactWrapper
     */
    findSpec(specId, parent, typeFilter) {
        if (typeof specId !== 'string') {
            throw new Error('Only string specIds are supported.');
        }

        return getSpecWrapper(parent || this._component, specId, typeFilter);
    }

    /**
     * Searches the react component for the passed specId's path expressed as an array,
     * then returns the nested enzyme ReactWrapper if found.
     * ex. find(MyComponent);
     *
     * @param  {Array} specPath specId to search for
     * @param  {string} parent element in which to apply the search, if different from current wrapped element
     * @param  {string} typeFilter element type filter to apply
     * @return {object}          enzyme ReactWrapper
     */
    findSpecPath(specPath, parent, typeFilter) {
        if (Array.isArray(specPath)) {
            return specPath.reduce((next, currentSpecId, idx, list) => this.findSpec(
                currentSpecId,
                next,
                (idx === list.length - 1) ? typeFilter : undefined
            ), parent);
        }

        throw new Error('Only array specPaths are supported.');
    }

    /**
     * Returns all fetch calls, optionally filtering by passed API endpoint
     * ex. getApiCalls('/api/v3/events/');
     *
     * @param  {string|RegExp} apiEndpoint  API endoint to match
     * @param  {string} method              HTTP method used (GET, POST, etc) (optional)
     * @return {array}                      Array of objects - [{url, params},]
     */
    getApiCalls(apiEndpoint, method = undefined) {
        return this._fetchMock.calls().matched
            .filter(([url, params]) => {
                const methodsMatch = !method || (params.method.toUpperCase() === method.toUpperCase());

                return methodsMatch && url.match(apiEndpoint);
            })
            .map(translateMockCallToObject);
    }

    /**
     * Polls for truthiness of passed predicate function, resolves
     * promise when the predicate returns true.
     * ex. await pollFor(() => a === 2);
     *
     * @param  {function} predicate     when predicate returns true, awaited promise will resolve
     * @param  {Number} timeout         time before pollFor exits polling
     */
    pollFor(predicate, timeout = this._waitTimeout) {
        validatePredicate(predicate);

        return new Promise((resolve, reject) => {
            poll(predicate, resolve, reject, timeout);
        });
    }

    /**
     * DEV ONLY - use to experiment with your tests
     * setTimeout promise
     * ex. await sleep(2000);
     *
     * @param  {Number} time milliseconds to sleep
     */
    sleep(time = 1000) {
        // eslint-disable-next-line no-console
        console.log('sleep is a test development tool, DO NOT SHIP TESTS USING sleep.');

        return new Promise((resolve) => setTimeout(resolve.bind(null, true), time));
    }

    /**
     * Resolves a returned promise when the passed selector is found on the react
     * component.
     * ex. await waitFor(MyComponent);
     *
     * @param  {string} selector    CSS selector to search for
     */
    waitFor(selector) {
        return this.pollFor(() => {
            // to be safe we should tell enzyme to re-render its render tree from React
            // See: http://airbnb.io/enzyme/docs/guides/migration-from-2-to-3.html#for-mount-updates-are-sometimes-required-when-they-werent-before
            this._component.update();

            return this.find(selector).exists();
        })
            .catch(() => {
                throw new Error(`Timeout waiting for ${selector}. It was never found.`);
            });
    }

    /**
     * Resolves a returned promise when the passed spec id is found on the react
     * component.
     * Equivalent to .waitFor('[data-spec=specId]'), but with all the extra functionality of
     * getSpecWrapper()
     * ex. await waitForSpec('my-spec');
     *
     * @param  {string} specId    spec id (data-spec attribute value) to wait for
     */
    waitForSpec(specId) {
        return this.pollFor(() => {
            // to be safe we should tell enzyme to re-render its render tree from React
            // See: http://airbnb.io/enzyme/docs/guides/migration-from-2-to-3.html#for-mount-updates-are-sometimes-required-when-they-werent-before
            this._component.update();

            return getSpecWrapper(this._component, specId).exists();
        })
            .catch(() => {
                throw new Error(`Timeout waiting for spec ${specId}. It was never found.`);
            });
    }

    /**
     * Resolves a returned promise when the passed endpoint is found in fetchMock's
     * matched calls array.
     * ex. await waitForApiCall('/api/v3/events');
     *
     * @param  {string|RegExp} apiEndpoint  API endpoint to match against fetchMock
     * @param  {string} method              HTTP method used (GET, POST, etc) (optional)
     */
    waitForApiCall(apiEndpoint, method = undefined) {
        const predicate = () => this.getApiCalls(apiEndpoint, method).length > 0;
        const _push = this._fetchMock._holdingPromises.push;

        // Resolves returned promise when the predicate returns true.
        // Uses fetchMocks promises to 'move time forward' before it
        // tests the passed predicate.
        // The predicate will be tested initially after all of
        // the promises currently in fetchMock._holdingPromises resolve.
        // If no resolution, the predicate will be tested after every following
        // promise that is added to _holdingPromises resolves.
        return new Promise((resolve) => {
            // test if predicate already passes
            checkPredicate(this._fetchMock, predicate, resolve);

            // else check predicate each time a new promise resolves from fetchMock
            this._fetchMock._holdingPromises.push = (...itemsToPush) => {
                _push.apply(this._fetchMock._holdingPromises, itemsToPush);
                checkPredicate(this._fetchMock, predicate, resolve);
            };
        });
    }
}
