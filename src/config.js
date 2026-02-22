export const CANVAS_TARGET = document.getElementById('canvas-target');
if (!CANVAS_TARGET) {
    throw new Error('Missing required DOM element: #canvas-target');
}