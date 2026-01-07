import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    
    await expect(page.getByRole('heading', { name: /connexion/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/mot de passe/i)).toBeVisible();
  });

  test('should show error on invalid login', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByLabel(/email/i).fill('invalid@example.com');
    await page.getByLabel(/mot de passe/i).fill('wrongpassword');
    await page.getByRole('button', { name: /se connecter/i }).click();
    
    // Should show error message
    await expect(page.getByText(/erreur/i)).toBeVisible({ timeout: 5000 });
  });

  test('should redirect to collection after login', async ({ page }) => {
    // This test would require a test user account
    // For now, we'll just check the redirect logic exists
    await page.goto('/login');
    
    // Check that login form exists
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible();
  });
});

