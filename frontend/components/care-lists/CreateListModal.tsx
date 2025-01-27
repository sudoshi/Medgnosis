"use client";

import { useState } from "react";
import { Dialog } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface CreateListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateList: (data: {
    name: string;
    description: string;
    type: "measure-based" | "manual";
    tags: string[];
  }) => void;
}

export default function CreateListModal({
  isOpen,
  onClose,
  onCreateList,
}: CreateListModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"measure-based" | "manual">("manual");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onCreateList({
        name,
        description,
        type,
        tags,
      });

      // Reset form
      setName("");
      setDescription("");
      setType("manual");
      setTags([]);
      setTagInput("");
      onClose();
    } catch (error) {
      console.error("Failed to create list:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <Dialog
      as="div"
      className="fixed inset-0 z-50 overflow-y-auto"
      open={isOpen}
      onClose={onClose}
    >
      <div className="min-h-screen px-4 text-center">
        <div aria-hidden="true" className="modal-backdrop fixed inset-0" />

        <div className="inline-block w-full max-w-2xl my-8 text-left align-middle modal-container modal-animate modal-content">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
              Create Care List
            </Dialog.Title>
            <button
              aria-label="Close dialog"
              className="p-2 rounded-lg text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
              onClick={onClose}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2"
                htmlFor="name"
              >
                List Name
              </label>
              <input
                required
                className="w-full px-4 py-2 rounded-lg bg-light-secondary dark:bg-dark-secondary border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
                id="name"
                placeholder="Enter list name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2"
                htmlFor="description"
              >
                Description
              </label>
              <textarea
                required
                className="w-full px-4 py-2 rounded-lg bg-light-secondary dark:bg-dark-secondary border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors min-h-[100px]"
                id="description"
                placeholder="Enter list description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                List Type
              </label>
              <div className="flex space-x-4">
                <button
                  className={`flex-1 px-4 py-2 rounded-lg border ${
                    type === "manual"
                      ? "bg-accent-primary text-white border-accent-primary"
                      : "bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:text-light-text-primary dark:hover:text-dark-text-primary"
                  } transition-colors`}
                  type="button"
                  onClick={() => setType("manual")}
                >
                  Manual
                </button>
                <button
                  className={`flex-1 px-4 py-2 rounded-lg border ${
                    type === "measure-based"
                      ? "bg-accent-primary text-white border-accent-primary"
                      : "bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary border-light-border dark:border-dark-border hover:text-light-text-primary dark:hover:text-dark-text-primary"
                  } transition-colors`}
                  type="button"
                  onClick={() => setType("measure-based")}
                >
                  Measure Based
                </button>
              </div>
            </div>

            <div>
              <label
                className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2"
                htmlFor="tags"
              >
                Tags
              </label>
              <input
                className="w-full px-4 py-2 rounded-lg bg-light-secondary dark:bg-dark-secondary border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
                id="tags"
                placeholder="Enter tags (press Enter to add)"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border"
                    >
                      {tag}
                      <button
                        aria-label={`Remove ${tag} tag`}
                        className="ml-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-accent-error transition-colors"
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t border-light-border dark:border-dark-border">
              <button
                className="px-4 py-2 rounded-lg bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary border border-light-border dark:border-dark-border transition-colors"
                disabled={isSubmitting}
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={isSubmitting || !name || !description}
                type="submit"
              >
                {isSubmitting ? "Creating..." : "Create List"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  );
}
