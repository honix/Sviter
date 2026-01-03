import { useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { uploadImage, type UploadResponse } from '../services/upload-api';
import { isImageFile } from '../utils/files';

interface UseImageUploadOptions {
  onUpload?: (result: UploadResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for handling image file uploads with a hidden file input.
 */
export function useImageUpload(options: UseImageUploadOptions = {}) {
  const { onUpload, onError } = options;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (isImageFile(file)) {
          const result = await uploadImage(file);
          onUpload?.(result);
        }
      }
    } catch (error) {
      console.error('Upload failed:', error);
      const err = error instanceof Error ? error : new Error('Upload failed');
      onError?.(err);
      if (!onError) {
        toast.error(err.message);
      }
    } finally {
      setIsUploading(false);
      // Reset input for re-uploading same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onUpload, onError]);

  const inputProps = {
    ref: fileInputRef,
    type: 'file' as const,
    accept: 'image/*',
    multiple: true,
    onChange: handleFileSelect,
    className: 'hidden',
  };

  return {
    isUploading,
    triggerUpload,
    inputProps,
    fileInputRef,
  };
}
