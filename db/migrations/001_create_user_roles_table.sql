-- Migration: Create user_roles table for RBAC
-- This table stores the role of each user based on their GitHub repository permissions

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    github_username TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('maintainer', 'contributor', 'viewer', 'guest')),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_github_username ON user_roles(github_username);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Function to automatically update last_updated
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updating last_updated on row update
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert initial admin role for the repository owner (yassineromdh-del)
-- Note: This should be run manually after identifying the user_id
-- INSERT INTO user_roles (user_id, github_username, role)
-- VALUES ('user-uuid-here', 'yassineromdh-del', 'maintainer');

-- Grant permissions for Supabase anon key
-- This allows the frontend to read/write to the table
GRANT SELECT, INSERT, UPDATE ON user_roles TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
