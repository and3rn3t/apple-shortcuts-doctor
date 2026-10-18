# Testing Patterns Reference

## Unit Test Pattern (Arrange-Act-Assert)

```typescript
describe('calculateTotal', () => {
  it('should apply discount when total exceeds threshold', () => {
    // Arrange
    const items = [
      { price: 50, quantity: 2 },
      { price: 30, quantity: 1 },
    ];
    const discount = 0.1;

    // Act
    const result = calculateTotal(items, discount);

    // Assert
    expect(result).toBe(117); // (100 + 30) * 0.9
  });

  it('should return 0 for empty cart', () => {
    expect(calculateTotal([], 0)).toBe(0);
  });

  it('should throw for negative quantities', () => {
    const items = [{ price: 10, quantity: -1 }];
    expect(() => calculateTotal(items, 0)).toThrow('Invalid quantity');
  });
});
```

## Mocking Patterns

### Dependency Injection (Preferred)

```typescript
// Production
class UserService {
  constructor(private repo: UserRepository) {}
  async getUser(id: string) { return this.repo.findById(id); }
}

// Test
const mockRepo = { findById: jest.fn().mockResolvedValue({ id: '1', name: 'Test' }) };
const service = new UserService(mockRepo);
```

### Module Mocking (When DI isn't available)

```typescript
jest.mock('../services/emailService');
const mockSend = emailService.send as jest.MockedFunction<typeof emailService.send>;
mockSend.mockResolvedValue({ success: true });
```

## API/Integration Test Pattern

```typescript
describe('POST /api/users', () => {
  it('should create user with valid data', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Test', email: 'test@example.com' })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: 'Test',
      email: 'test@example.com',
    });
  });

  it('should return 400 for invalid email', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Test', email: 'not-an-email' })
      .expect(400);

    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'email' })
    );
  });
});
```

## Test Data Patterns

### Factory Pattern

```typescript
function createUser(overrides: Partial<User> = {}): User {
  return {
    id: randomUUID(),
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date(),
    ...overrides,
  };
}

// Usage
const admin = createUser({ role: 'admin' });
const inactive = createUser({ active: false });
```

### Builder Pattern

```typescript
class UserBuilder {
  private user: Partial<User> = {};
  withName(name: string) { this.user.name = name; return this; }
  withRole(role: Role) { this.user.role = role; return this; }
  build(): User { return createUser(this.user); }
}

const user = new UserBuilder().withName('Admin').withRole('admin').build();
```

## Coverage Guidelines

| Category | Target | Priority |
|----------|--------|----------|
| Business logic | 90%+ | High |
| API handlers | 80%+ | High |
| Utilities | 90%+ | Medium |
| UI components | 70%+ | Medium |
| Configuration | 50%+ | Low |
