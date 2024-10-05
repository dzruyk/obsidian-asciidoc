
export function createEl(tagName: string, attrs?: any): HTMLElement {
	const c = document.createElement(tagName)
	if (!attrs)
		return c
	for (let p in attrs) {
		if (!p || !Object.prototype.hasOwnProperty.call(attrs, p))
			continue
		if (p == "textContent") {
			c.setText(attrs[p])
		} else {
			c.setAttribute(p, attrs[p])
		}
	}
	return c
}
