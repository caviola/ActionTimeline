# What is an ActionTimeline?

An ActionTimeline allows you to create workflows of asynchronous operations. It was originally developed to coordinate the execution of DOM animations. A trivial use case would be:

1. move a box to the left in 2 seconds
2. wait 2 seconds
3. move it down
4. move another box to the right while incrementing its width to 200px and changing its opacity to 50%
5. wait 2 seconds
6. move both objects to the top left of the screen in 2 seconds.

An ActionTimeline consists of a custom sequence of the following primitive operations:

- **call(fn):** Executes the given function. This is intended for simple/quick operations.
- **sleep(M):** Wait M milliseconds before advancing to the next action.
- **animate([...]):** Perform a set of animations in parallel. When all animations have finished then advance to the next action.
- **wait(fn|ActionTimeline):** Call a function or start another ActionTimeline but don't advance to the next action until the function/ActionTimeline notifies that it has finished.
- **launch(fn|ActionTimeline):** Call a function or start another ActionTimeline and immediately advance to the next action. This is typically used to initiate an asynchronous operation. The side effect of this action is that completion callbacks won't be called until all "launched" functions and/or ActionTimelines have notified that they have finished.
- **after(fn):** Registers a completion callback to be called when there are no more actions to execute and all pending "launched" actions have finished.

Note that ActionTimeline is not limited to DOM animations. With **wait(...)** and **launch(..)** you can initiate any asynchronous operation like AJAX requests. It's also through these primitives that you can chain into another ActionTimeline. This posibility allows for the implementation of complex workflows.

The code for the above use case would be:

```js
new ActionTimeline()
    .animate([[box1, "left:0", {duration:2000}]])
    .sleep(2000)
    .animate([[box1, "top:200px", {duration:2000}]])
    .animate([[box2, "left:150px; width:200px; opacity:0.5", {duration:2000}]])
    .sleep(2000)
    .animate([
        [box1, "top:0px; left:0px;", {duration:1000}],
        [box2, "top:0px; left:0px;", {duration:1000}]
    ])
    .play();    
```

## Notes

The ActionTimeline is implemented using a queue and a state machine. Besides, it relies on the [Emile](https://github.com/madrobby/emile) library for CSS property animations. Note that for Emile animations to work the CSS property you are animating must have an initial value. The implementation also assumes *Function.bind()* is already defined.
