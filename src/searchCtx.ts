import Mark from 'mark.js'

class SearchCtx {
  private isSearchActive: boolean;
  private mark: any;
  private root: HTMLElement;
  private resultOffset: number;
  private searchBox: HTMLElement;
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

    let searchDialog = '<span class="CodeMirror-search-label">Search:</span> <input type="text" style="width: 10em" class="CodeMirror-search-field"/> <span style="color: #888" class="CodeMirror-search-hint"></span>';

    let searchBox = document.createElement("div");
    searchBox.className = "CodeMirror-dialog CodeMirror-dialog-top";
    searchBox.innerHTML = searchDialog;
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
    console.log("nextsearch")
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
    if (this.isSearchActive) {
      let collection = this.searchBox.getElementsByTagName("input");
      if (collection.length)
        collection[0].focus();
      return;
    } else {
      this.render();
    }
  }

  resetSearch() {
    if (this.isSearchActive) {
      this.searchBox.remove();
    }
    this.isSearchActive = false;
    //this.searchBox.hidden = true;
  }
}
