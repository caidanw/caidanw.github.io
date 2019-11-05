---
layout: post
title: The Four Pillars of Object-Orientated Programming
permalink: the-four-pillars-of-object-orientated-programming
date: 2017-12-06 00:24
---

### Summary

For a programming language to be properly considered as OOP, it must
contain these four main concepts. The are four pillars of OOP:
inheritance, polymorphism, abstraction, and encapsulation. Also,
remember that for a programming language to be considered OOP it must be
able to create classes that can interact with each other.

`OOP Languages: - Java - Python - Ruby Functional Languages: - PHP -
Haskell - Lisp`

---

### Inheritance

When you create a class, you can *inherit* another class (which will
allow the new class to have access to the parent class's variables and
methods).

`class MotherDuck():   def __init__(self, name, weight, is_hungry):
    # weight is in lbs.     self.name = name     self.weight =
weight     self.is_hungry = is_hungry`

`class Duckling(MotherDuck):   def cry(self):     print("{name} is
crying!".format(name=self.name))`

Now that we have defined both our parent class (MotherDuck) and our
child class (Duckling) we can now observe how they interact with each
other. Notice that when defining the Duckling class we pass it the
argument MotherDuck, this keyword (the parent class name) tells the
compiler that we want all of MotherDuck class variables and methods.

First, create a new duckling and call its cry method

`>> duckling = Duckling("Jake", 2, False) >>> duckling.cry() Jake is
crying!`

Now try to do the same with parent class (MotherDuck)

`>>> mama = MotherDuck("Karen", 5, True) >>> mama.is_hungry True >>>
mama.cry() Traceback (most recent call last):   File "", line 1, in
    mama.cry() AttributeError: 'MotherDuck' object has no attribute
'cry'`

Only the child class will be able to use the parent class's variables
and methods, this makes for cleaner code, less redundancy, and more
efficiency.

---

### Polymorphism

A great definition of pragmatic polymorphism is, "polymorphism is the
ability (in programming) to present the same interface for different
underlying forms (data types)." An interface refers to one or more
functions or methods. Meaning a function or method that can achieve a
similar result with different data types (eg. string, int, float, bool,
etc.)

If we look at python's built-in function `print()` we know that it will
take any different data type (including classes) and determine what to
appropriately print to the console depending on the used type of data.
This is done without the need to call a seperate function for a specific
data type. eg. `print_bool()` `print_string()`

---

### Abstraction

Abstraction is used in OOP when we create a class and define its
methods. When we define a class, and the methods that go with it, we are
creating an *abstraction*. When designing OO programs, we are creating
*abstractions* of different concepts that all work together to form our
program. Abstraction allows us to model objects with clear boundaries,
and have them interact with each other.

---

### Encapsulation

Encapsulation hides our codes internal data. When code and data have
been encapsulated, it means when it is called, the caller cannot access
the code's internal data. This concept plays a big role in security by
denying access to certain pieces of data.

This also helps when trying to maintain code that is reliable, such as
changing a data type from a list to a tuple. Trying to directly append
to a tuple will give issues if we are expecting to append to a list. We
can solve this issue by making a function that appends to our desired
data type with a single function. This keeps the list/tuple data secret
while still giving reliable functionality to a program or any clients
that use the code.

---

### Composition

This is not one of the four pillars of OOP but it is an important
concept that helps the rest. The composition of a program represents
"has a" relationships, this occurs when one object stores another object
as a variable.

Let's represent this with an example, we will show the relationship
between a dog and it's owner. A dog "has a(n)" owner.

`class Dog():   def __init__(self, name, breed, owner):     self.name =
name     self.breed = breed     self.owner = owner`

`class Person():   def __init__(self, name):     self.name = name`

When we create a new dog object, we pass in a person object as the owner
argument

`>>> rob = Person("Dread Pirate Roberts") >>> dog = Dog("Kevin",
"Pitbull", rob) >>> print(dog.owner.name) Dread Pirate Roberts`

Now the dog Kevin belongs to the Dread Pirate Roberts, and we can easily
reference the dog's owner.
