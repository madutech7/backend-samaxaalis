/**
 * User document interface for Firestore
 * Collection: "users"
 */
export interface UserDocument {
  id: string;
  email: string;
  password: string;
  name: string;
  currency: string;
  refreshToken?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User response (sans données sensibles)
 */
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}
