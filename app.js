
function GoogleBookmarksLoader() {
    
    this.xmldoc = undefined;
    this.successCallback = undefined;

    this.init = function(callbacks) {
        this.successCallback = callbacks.success;

        // re-download bookmarks automatically every 24h
        var day = (24*60*60*1000);
        if ((this.getLastRefresh() + day) < Date.now()) {
            this.downloadBookmarks();
        } else {
            this.loadFromLocalStorage();
            this.successCallback(this);
        }
    }
    
    this.getLastRefresh = function() {
        return (localStorage.lastRefresh == undefined) ? 0 : localStorage.lastRefresh;
    }

    this.loadFromLocalStorage = function() {
        this.xmldoc = new DOMParser().parseFromString(localStorage.bookmarks, "text/xml");
    }

    this.saveToLocalStorage = function() {
        localStorage.lastRefresh = Date.now();
        localStorage.bookmarks = new XMLSerializer().serializeToString(this.xmldoc);
    }

    this.downloadBookmarks = function () {
        $.ajax({ type: 'GET',
                 url: 'https://www.google.com/bookmarks/?output=xml&num=10000',
                 dataType: 'xml',
                 context: this,
                 success: this.onDownloadFinished,
                 error: this.onDownloadFailed });
    }


    this.onDownloadFinished = function(xml) {
        this.xmldoc = xml;
        this.saveToLocalStorage();
        this.successCallback(this);
    }

    this.onDownloadFailed = function(error) {
        log(error);
    }
    
    this.getLabels = function() {
        var labels = {};
        var iter = this.xmldoc.evaluate('//label/text()', this.xmldoc, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);

        // count label frequencies
        var node = undefined;
        while (node = iter.iterateNext()) {
            var label = node.data;
            labels[label] = (label in labels) ? labels[label] + 1 : 1;
        }

        // return labels in alphabetically sorted array
        var labelsArray = [];
        for (var key in labels) labelsArray.push(
            { 'label': key, 
              'frequency': labels[key],
              'selected': ko.observable(false),
            });

        return labelsArray.sort(function (a,b) { 
            return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
        });
    }     

    this.getBookmarks = function(labels) {
        var iter = undefined;
        if (labels.length == 0) {
            iter = this.xmldoc.evaluate("//bookmark");
        } else {
            var predicates = labels.map(function(l) { return "label='" + l + "'"; });
            iter = this.xmldoc.evaluate("//bookmark/labels[" + predicates.join(" or ") + "]/..", this.xmldoc, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
        }

        var bookmarks = [];
        var node = undefined;
        while (node = iter.iterateNext()) {
            var labelNodes = node.getElementsByTagName("label");
            var labelTexts = []
            for (var i=0; i<labelNodes.length; i++) {
                labelTexts.push(labelNodes[i].childNodes[0].nodeValue);
            }
            var url = node.getElementsByTagName("url")[0].childNodes[0].nodeValue;
            bookmarks.push(
                { 'title': node.getElementsByTagName("title")[0].childNodes[0].nodeValue,
                  'url': url,
                  'id': node.getElementsByTagName("id")[0].childNodes[0].nodeValue,
                  'labels': labelTexts,
                  'domain': url.match(/:\/\/(.[^/]+)/)[1],
                });
        }

        return bookmarks;
    }

}


function BookmarksViewModel() {

    var self = this    
    self.loader = undefined;

    self.labels = ko.observableArray([]);
    self.bookmarks = ko.observableArray([]);


    self.selectLabel = function(data, event) {
        data.selected(!data.selected());

        var selectedLabels = [];
        var labels = self.labels();
        for (var i in labels) {
            var l = labels[i];
            if (l.selected()) {
                selectedLabels.push(l.label);
            }
        }
        if (selectedLabels.length > 0) {
            self.bookmarks(self.loader.getBookmarks(selectedLabels));
        } else {
            self.bookmarks.destroyAll();
        }
    }

    self.populate = function(loader) {
        self.loader = loader
        self.labels(loader.getLabels());
        ko.applyBindings(self);
    }

}

function main() {
    var model = new BookmarksViewModel();
    var loader = new GoogleBookmarksLoader();

    loader.init({ success: model.populate });
}
