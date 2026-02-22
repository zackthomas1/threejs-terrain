export const CANVASS_TARGET = document.getElementById('canvas-target');
if (!CANVASS_TARGET) {
    throw new Error('Missing required DOM element: #canvas-target');
}