import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Paginates an array of data.
 */
export function paginate(data: any[], { page = 1, limit = 10 }) {
	if (limit) {
		return data.slice((page - 1) * limit, page * limit);
	}

	return data;
}

export function slugify(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/[\s_]/g, '-') // replace all spaces and underscores with hyphens
		.replace(/[^a-z0-9-]/g, ''); // remove any non-alphanumeric characters
}
