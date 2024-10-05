import Mark from 'mark.js'
import { createEl } from "./util"

export class SearchCtx {
  private isSearchActive: boolean;
  private mark: any;
  private root: HTMLElement;
  private resultOffset: number;
  private searchBox: HTMLElement | null;
  private searchContainer: HTMLElement;

  constructor(rootDiv: HTMLElement, searchContainer: HTMLElement) {
    this.root = rootDiv;
    this.mark = new Mark(rootDiv);
    this.isSearchActive = false;
    this.resultOffset = 0;
    this.searchBox = null;
    this.searchContainer = searchContainer;
  }

  render() {
    this.isSearchActive = true;

    let searchBox = createEl("div", { class: "CodeMirror-dialog CodeMirror-dialog-top" })
    searchBox.appendChild(
      createEl("span", {
          class: "CodeMirror-search-label",
          textContent: "Search:",
      })
    )
    searchBox.appendChild(
      createEl("input", {
          type: "text",
          class: "CodeMirror-search-field"
      })
    )
    searchBox.appendChild(
      createEl("span", {
          class: "CodeMirror-search-hint",
      })
    )

    this.searchContainer.insertBefore(searchBox, this.searchContainer.children[0]);
    let collection = searchBox.getElementsByTagName("input");
    collection[0].addEventListener("keyup", (e: KeyboardEvent) => {
      if (e.keyCode == 13) {
        this.search(collection[0].value);
      }
    }, true)
    collection[0].focus();

    this.searchBox = searchBox;
  }

  search(s: string) {
    if (!this.isSearchActive) {
      this.resultOffset = 0;
    }
    this.isSearchActive = true;
    this.mark.unmark();
    this.mark.mark(s, { separateWordSearch: false } );
    let elements = this.root.getElementsByTagName("mark");
    if (elements.length != 0) {
      if (this.resultOffset >= elements.length)
        this.resultOffset = 0;

      elements[this.resultOffset].scrollIntoView();
      this.resultOffset += 1;
    }
  }

  focus() {
    if (this.isSearchActive && this.searchBox) {
      let collection = this.searchBox.getElementsByTagName("input");
      if (collection.length)
        collection[0].focus();
      return;
    } else {
      this.render();
    }
  }

  resetSearch() {
    if (this.isSearchActive && this.searchBox) {
      this.searchBox.remove();
    }
    this.isSearchActive = false;
    //this.searchBox.hidden = true;
  }
}
