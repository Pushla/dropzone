/*
 * File upload form field control
 *
 * Data attributes:
 * - data-control="fileupload" - enables the file upload plugin
 * - data-template - a Dropzone.js template to use for each item
 * - data-error-template - a popover template used to show an error
 * - data-sort-handler - AJAX handler for sorting postbacks
 *
 * JavaScript API:
 * $('div').fileUploader()
 *
 * Dependancies:
 * - Dropzone.js
 */
+function ($) { "use strict";

    // FILEUPLOAD CLASS DEFINITION
    // ============================

    var FileUpload = function (element, options) {
        this.$el = $(element)
        this.options = options || {}
        this.init()
    }

    FileUpload.prototype.init = function() {
        if (this.options.isMulti === null) {
            this.options.isMulti = this.$el.hasClass('is-multi')
        }

        if (this.options.isPreview === null) {
            this.options.isPreview = this.$el.hasClass('is-preview')
        }

        if (this.options.isSortable === null) {
            this.options.isSortable = this.$el.hasClass('is-sortable')
        }

        this.$el.one('dispose-control', $.proxy(this.dispose, this))
        this.$uploadButton = $('.upload-button', this.$el)
        this.$filesContainer = $('.upload-files-container', this.$el)
        this.uploaderOptions = {}

        // Stop here for preview mode
        if (this.options.isPreview)
            return

        this.$el.on('click', '.upload-remove-button', $.proxy(this.onRemoveObject, this))

        this.bindUploader()

	    this.imagesCounter = $('#formUpload-images input[name="images_count"]');

	    this.imagesCounter.on('change', this.toggleUploadButton);

	    if (this.imagesCounter.val() >= 30) {
		    $('#formUpload-images .upload-files-container .is-upload-button').hide()
	    }

        if (this.options.isSortable) {
            this.bindSortable()
        }

    }

	FileUpload.prototype.toggleUploadButton = function () {
		let uploadButton = $('#formUpload-images .upload-files-container .is-upload-button');
		if ($('#formUpload-images input[name="images_count"]').val() >= 30) {
			uploadButton.hide()
			return;
		}
		uploadButton.show();
	}

    FileUpload.prototype.dispose = function() {

        this.$el.off('click', '.upload-object.is-success', $.proxy(this.onClickSuccessObject, this))
        this.$el.off('click', '.upload-object.is-error', $.proxy(this.onClickErrorObject, this))
        this.$el.off('click', '.upload-remove-button', $.proxy(this.onRemoveObject, this))

        this.$el.off('dispose-control', $.proxy(this.dispose, this))
        this.$el.removeData('oc.fileUpload')

        this.$el = null
        this.$uploadButton = null
        this.$filesContainer = null
        this.uploaderOptions = null

        // In some cases options could contain callbacks,
        // so it's better to clean them up too.
        this.options = null
    }

    //
    // Uploading
    //

    FileUpload.prototype.bindUploader = function() {
        this.uploaderOptions = {
            url: this.options.url,
	        autoProcessQueue: !this.options.manualUpload,
            paramName: this.options.paramName,
            clickable: this.$uploadButton.get(0),
            previewsContainer: this.$filesContainer.get(0),
            maxFiles: !this.options.isMulti ? 1 : null,
            maxFilesize: this.options.maxFilesize,
            timeout: 0,
            dictInvalidFileType: "Этот тип файла недоступн для загрузки.",
            headers: {}
        }

        if (this.options.fileTypes) {
            this.uploaderOptions.acceptedFiles = this.options.fileTypes
        }

        if (this.options.template) {
            this.uploaderOptions.previewTemplate = $(this.options.template).html()
        }

        this.uploaderOptions.thumbnailWidth = this.options.thumbnailWidth
            ? this.options.thumbnailWidth : null

        this.uploaderOptions.thumbnailHeight = this.options.thumbnailHeight
            ? this.options.thumbnailHeight : null

        this.uploaderOptions.resize = this.onResizeFileInfo

        /*
         * Add CSRF token to headers
         */
        var token = $('meta[name="csrf-token"]').attr('content')
        if (token) {
            this.uploaderOptions.headers['X-CSRF-TOKEN'] = token
        }

        this.dropzone = new Dropzone(this.$el.get(0), this.uploaderOptions)
        this.dropzone.on('addedfile', $.proxy(this.onUploadAddedFile, this))
        this.dropzone.on('sending', $.proxy(this.onUploadSending, this))
        this.dropzone.on('success', $.proxy(this.onUploadSuccess, this))
        this.dropzone.on('error', $.proxy(this.onUploadError, this))
	    this.$el.data('dropzone', this.dropzone);
    }

    FileUpload.prototype.onResizeFileInfo = function(file) {
        var info,
            targetWidth,
            targetHeight

        if (!this.options.thumbnailWidth && !this.options.thumbnailWidth) {
            targetWidth = targetHeight = 100
        }
        else if (this.options.thumbnailWidth) {
            targetWidth = this.options.thumbnailWidth
            targetHeight = this.options.thumbnailWidth * file.height / file.width
        }
        else if (this.options.thumbnailHeight) {
            targetWidth = this.options.thumbnailHeight * file.height / file.width
            targetHeight = this.options.thumbnailHeight
        }

        // drawImage(image, srcX, srcY, srcWidth, srcHeight, trgX, trgY, trgWidth, trgHeight) takes an image, clips it to
        // the rectangle (srcX, srcY, srcWidth, srcHeight), scales it to dimensions (trgWidth, trgHeight), and draws it
        // on the canvas at coordinates (trgX, trgY).
        info = {
            srcX: 0,
            srcY: 0,
            srcWidth: file.width,
            srcHeight: file.height,
            trgX: 0,
            trgY: 0,
            trgWidth: targetWidth,
            trgHeight: targetHeight
        }

        return info
    }

    FileUpload.prototype.onUploadAddedFile = function(file) {
        var $object = $(file.previewElement).data('dzFileObject', file),
            filesize = this.getFilesize(file)

        // Change filesize format to match October\Rain\Filesystem\Filesystem::sizeToString() format
        $(file.previewElement).find('[data-dz-size]').html('<strong>' + filesize.size + '</strong> ' + filesize.units)

        // Remove any exisiting objects for single variety
        if (!this.options.isMulti) {
            this.removeFileFromElement($object.siblings())
        } else {
            this.$uploadButton.parent().appendTo(this.$filesContainer); // xhack
        }

        this.evalIsPopulated()
    }

    FileUpload.prototype.onUploadSending = function(file, xhr, formData) {
        this.addExtraFormData(formData)
        xhr.setRequestHeader('X-OCTOBER-REQUEST-HANDLER', this.options.uploadHandler)
    }

    FileUpload.prototype.onUploadSuccess = function(file, response) {
        var $preview = $(file.previewElement),
            $img = $('img', $preview)

        $preview.addClass('is-success')

        if (response.id) {
            $preview.data('id', response.id)
            $preview.data('path', response.path)
            $('.upload-remove-button', $preview).data('request-data', { file_id: response.id })
            $img.attr('src', response.thumb)
        }

        this.triggerChange();
    }

    FileUpload.prototype.onUploadError = function(file, error) {
        var $preview = $(file.previewElement)
        $.oc.flashMsg({text: error || 'Ошибка загрузки файла!', class: 'error'})
        $preview.addClass('is-error')
    }

    /*
     * Trigger change event (Compatibility with october.form.js)
     */
    FileUpload.prototype.triggerChange = function() {
        this.$el.closest('[data-field-name]').trigger('change.oc.formwidget')
    }

    FileUpload.prototype.addExtraFormData = function(formData) {
        if (this.options.extraData) {
            $.each(this.options.extraData, function (name, value) {
                formData.append(name, value)
            })
        }

        var $form = this.$el.closest('form')
        if ($form.length > 0) {
            $.each($form.serializeArray(), function (index, field) {
                formData.append(field.name, field.value)
            })
        }
    }

    FileUpload.prototype.removeFileFromElement = function($element) {
        var self = this

        $element.each(function() {
            var $el = $(this),
                obj = $el.data('dzFileObject')

            if (obj) {
                self.dropzone.removeFile(obj)
            }
            else {
                $el.remove()
            }
        })
    }

    //
    // Sorting
    //

    FileUpload.prototype.bindSortable = function() {
        var
            self = this,
            placeholderEl = $('<div class="upload-object upload-placeholder"/>').css({
                width: 295,
                height: 295
            })

        new Sortable(this.$filesContainer.get(0), {
            animation: 150,
            handle: '.drag-handle',
            draggable: 'div.upload-object.is-success',
            ghostClass: 'blue-background-class',
            onSort: function (/**Event*/ evt) {
                self.onSortAttachments()
            },
        });
    }

    FileUpload.prototype.onSortAttachments = function() {
        if (this.options.sortHandler) {

            /*
             * Build an object of ID:ORDER
             */
            var orderData = {}

            this.$el.find('.upload-object.is-success')
                .each(function(index){
                    var id = $(this).data('id')
                    orderData[id] = index + 1
                })

            this.$el.request(this.options.sortHandler, {
                data: { sortOrder: orderData }
            })
        }
    }

    //
    // User interaction
    //

    FileUpload.prototype.onRemoveObject = function(ev) {
        var self = this,
            $object = $(ev.target).closest('.upload-object')

        $(ev.target)
            .closest('.upload-remove-button')
            .one('ajaxPromise', function(){
                $object.addClass('is-loading')
            })
            .one('ajaxDone', function(){
                self.removeFileFromElement($object)
                self.evalIsPopulated()
                self.triggerChange()
            })
            .request()

        ev.stopPropagation()
    }

    FileUpload.prototype.onClickSuccessObject = function(ev) {
        if ($(ev.target).closest('.meta').length) return

        var $target = $(ev.target).closest('.upload-object')
        window.open($target.data('path'))
    }

    FileUpload.prototype.onClickErrorObject = function(ev) {
        var
            self = this,
            $object = $(ev.target).closest('.upload-object'),
            errorMsg = $('[data-dz-errormessage]', $object).text()

        alert(errorMsg)

        this.removeFileFromElement($object)
        self.evalIsPopulated()
    }

    //
    // Helpers
    //

    FileUpload.prototype.evalIsPopulated = function() {
        var isPopulated = $('.upload-object', this.$filesContainer).length
        this.$el.toggleClass('is-populated', !!isPopulated)
        $('[name="images_count"]', this.$el)
            .val(isPopulated ? isPopulated : '').trigger('change')

        // Reset maxFiles counter
        if (!isPopulated) {
            this.dropzone.removeAllFiles()
        }
    }

    /*
     * Replicates the formatting of October\Rain\Filesystem\Filesystem::sizeToString(). This method will return
     * an object with the file size amount and the unit used as `size` and `units` respectively.
     */
    FileUpload.prototype.getFilesize = function (file) {
        var formatter = new Intl.NumberFormat('en', {
                style: 'decimal',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            size = 0,
            units = 'bytes'

        if (file.size >= 1073741824) {
            size = formatter.format(file.size / 1073741824)
            units = 'GB'
        } else if (file.size >= 1048576) {
            size = formatter.format(file.size / 1048576)
            units = 'MB'
        } else if (file.size >= 1024) {
            size = formatter.format(file.size / 1024)
            units = 'KB'
        } else if (file.size > 1) {
            size = file.size
            units = 'bytes'
        } else if (file.size === 1) {
            size = 1
            units = 'byte'
        }

        return {
            size: size,
            units: units
        }
    }

    FileUpload.DEFAULTS = {
        url: window.location,
        uploadHandler: null,
        sortHandler: null,
        extraData: {},
        paramName: 'file_data',
        fileTypes: null,
        maxFilesize: 256,
        template: null,
        errorTemplate: null,
	    manualUpload: null,
        isMulti: null,
        isPreview: null,
        isSortable: null,
        thumbnailWidth: 120,
        thumbnailHeight: 120
    }

    // FILEUPLOAD PLUGIN DEFINITION
    // ============================

    var old = $.fn.fileUploader

    $.fn.fileUploader = function (option) {
        return this.each(function () {
            var $this   = $(this)
            var data    = $this.data('oc.fileUpload')
            var options = $.extend({}, FileUpload.DEFAULTS, $this.data(), typeof option == 'object' && option)
            if (!data) $this.data('oc.fileUpload', (data = new FileUpload(this, options)))
            if (typeof option == 'string') data[option].call($this)
        })
    }

    $.fn.fileUploader.Constructor = FileUpload

    // FILEUPLOAD NO CONFLICT
    // =================

    $.fn.fileUploader.noConflict = function () {
        $.fn.fileUpload = old
        return this
    }

    // FILEUPLOAD DATA-API
    // ===============
    $(document).render(function () {
        $('[data-control="fileupload"]').fileUploader()
    })

}(window.jQuery);
